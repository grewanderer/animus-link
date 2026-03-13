use std::{future::Future, time::Duration};

use serde::{Deserialize, Serialize};
use serde_json::Value;
use tokio::{
    io::{AsyncReadExt, AsyncWriteExt},
    net::TcpStream,
    time::timeout,
};

use crate::errors::CliError;

const DEFAULT_TIMEOUT: Duration = Duration::from_secs(5);

#[derive(Debug, Clone)]
pub struct DaemonClient {
    endpoint: Endpoint,
    timeout: Duration,
}

#[derive(Debug, Clone)]
struct Endpoint {
    authority: String,
    host: String,
    port: u16,
}

#[derive(Debug)]
struct Response {
    status_code: u16,
    body: Vec<u8>,
}

#[derive(Debug, Deserialize)]
struct ApiErrorEnvelope {
    error: ApiErrorBody,
}

#[derive(Debug, Deserialize)]
struct ApiErrorBody {
    code: String,
    message: String,
}

impl DaemonClient {
    pub fn new(base_url: &str) -> Result<Self, CliError> {
        Ok(Self {
            endpoint: Endpoint::parse(base_url)?,
            timeout: DEFAULT_TIMEOUT,
        })
    }

    pub async fn get_json(&self, path: &str) -> Result<Value, CliError> {
        let response = self.send("GET", path, None).await?;
        self.decode_json(response)
    }

    pub async fn get_text(&self, path: &str) -> Result<String, CliError> {
        let response = self.send("GET", path, None).await?;
        self.decode_text(response)
    }

    pub async fn post_empty_json(&self, path: &str) -> Result<Value, CliError> {
        let response = self.send("POST", path, Some(RequestBody::empty())).await?;
        self.decode_json(response)
    }

    pub async fn post_json<T: Serialize>(&self, path: &str, value: &T) -> Result<Value, CliError> {
        let body = serde_json::to_vec(value).map_err(|error| {
            CliError::invalid_response(format!("failed to encode request body: {error}"))
        })?;
        let response = self
            .send("POST", path, Some(RequestBody::json(body)))
            .await?;
        self.decode_json(response)
    }

    async fn send(
        &self,
        method: &str,
        path: &str,
        request_body: Option<RequestBody>,
    ) -> Result<Response, CliError> {
        if !path.starts_with('/') {
            return Err(CliError::config("daemon path must start with '/'"));
        }

        let request_body = request_body.unwrap_or_else(RequestBody::empty);
        let mut request = format!(
            "{method} {path} HTTP/1.1\r\nHost: {}\r\nConnection: close\r\nContent-Length: {}\r\n",
            self.endpoint.authority,
            request_body.bytes.len()
        );
        if let Some(content_type) = request_body.content_type.as_deref() {
            request.push_str(format!("Content-Type: {content_type}\r\n").as_str());
        }
        request.push_str("\r\n");

        let mut stream = self
            .with_timeout(
                "connect to the link daemon",
                TcpStream::connect((self.endpoint.host.as_str(), self.endpoint.port)),
            )
            .await?;

        self.with_timeout(
            "write the CLI request",
            stream.write_all(request.as_bytes()),
        )
        .await?;
        if !request_body.bytes.is_empty() {
            self.with_timeout(
                "write the CLI request body",
                stream.write_all(&request_body.bytes),
            )
            .await?;
        }
        self.with_timeout("flush the CLI request", stream.flush())
            .await?;
        self.with_timeout("finish the CLI request", stream.shutdown())
            .await?;

        let mut response_bytes = Vec::new();
        self.with_timeout(
            "read the daemon response",
            stream.read_to_end(&mut response_bytes),
        )
        .await?;

        parse_response(response_bytes)
    }

    fn decode_json(&self, response: Response) -> Result<Value, CliError> {
        if response.status_code >= 400 {
            return Err(decode_api_error(response));
        }

        serde_json::from_slice(&response.body).map_err(|error| {
            CliError::invalid_response(format!("daemon returned invalid JSON: {error}"))
        })
    }

    fn decode_text(&self, response: Response) -> Result<String, CliError> {
        if response.status_code >= 400 {
            return Err(decode_api_error(response));
        }
        String::from_utf8(response.body).map_err(CliError::from)
    }

    async fn with_timeout<F, T>(&self, action: &'static str, future: F) -> Result<T, CliError>
    where
        F: Future<Output = std::io::Result<T>>,
    {
        timeout(self.timeout, future)
            .await
            .map_err(|_| CliError::Timeout(action))?
            .map_err(|source| CliError::io(action, source))
    }
}

#[derive(Debug, Clone)]
struct RequestBody {
    content_type: Option<String>,
    bytes: Vec<u8>,
}

impl RequestBody {
    fn empty() -> Self {
        Self {
            content_type: None,
            bytes: Vec::new(),
        }
    }

    fn json(bytes: Vec<u8>) -> Self {
        Self {
            content_type: Some("application/json".to_string()),
            bytes,
        }
    }
}

impl Endpoint {
    fn parse(raw: &str) -> Result<Self, CliError> {
        let trimmed = raw.trim();
        let rest = trimmed
            .strip_prefix("http://")
            .ok_or_else(|| CliError::config("daemon URL must start with http://"))?;

        let (authority, path) = match rest.split_once('/') {
            Some((authority, path)) => (authority, path),
            None => (rest, ""),
        };

        if authority.is_empty() {
            return Err(CliError::config("daemon URL is missing host"));
        }
        if !path.is_empty() {
            return Err(CliError::config(
                "daemon URL must not include a path; use host:port only",
            ));
        }
        if authority.contains('@') {
            return Err(CliError::config("daemon URL must not include user info"));
        }

        if let Some(host) = authority.strip_prefix('[') {
            return parse_ipv6_authority(host);
        }

        let (host, port) = match authority.rsplit_once(':') {
            Some((host, port)) if !host.is_empty() && !host.contains(':') => {
                (host.to_string(), parse_port(port)?)
            }
            Some(_) => {
                return Err(CliError::config(
                    "IPv6 daemon URLs must use bracket notation like http://[::1]:9999",
                ));
            }
            None => (authority.to_string(), 80),
        };

        Ok(Self {
            authority: if port == 80 {
                host.clone()
            } else {
                format!("{host}:{port}")
            },
            host,
            port,
        })
    }
}

fn parse_ipv6_authority(authority: &str) -> Result<Endpoint, CliError> {
    let end = authority
        .find(']')
        .ok_or_else(|| CliError::config("invalid IPv6 daemon URL"))?;
    let host = authority[..end].to_string();
    let remainder = &authority[end + 1..];
    let port = if remainder.is_empty() {
        80
    } else if let Some(port) = remainder.strip_prefix(':') {
        parse_port(port)?
    } else {
        return Err(CliError::config("invalid IPv6 daemon URL"));
    };

    Ok(Endpoint {
        authority: if port == 80 {
            format!("[{host}]")
        } else {
            format!("[{host}]:{port}")
        },
        host,
        port,
    })
}

fn parse_port(port: &str) -> Result<u16, CliError> {
    port.parse::<u16>()
        .map_err(|_| CliError::config("daemon URL contains an invalid port"))
}

fn parse_response(bytes: Vec<u8>) -> Result<Response, CliError> {
    let header_end = bytes
        .windows(4)
        .position(|window| window == b"\r\n\r\n")
        .ok_or_else(|| CliError::invalid_response("daemon response was missing HTTP headers"))?;
    let header_text = std::str::from_utf8(&bytes[..header_end])
        .map_err(|_| CliError::invalid_response("daemon returned non-UTF-8 HTTP headers"))?;

    let mut lines = header_text.split("\r\n");
    let status_line = lines
        .next()
        .ok_or_else(|| CliError::invalid_response("daemon response was missing a status line"))?;
    let mut status_parts = status_line.split_whitespace();
    let _http_version = status_parts
        .next()
        .ok_or_else(|| CliError::invalid_response("daemon response was missing HTTP version"))?;
    let status_code = status_parts
        .next()
        .ok_or_else(|| CliError::invalid_response("daemon response was missing status code"))?
        .parse::<u16>()
        .map_err(|_| CliError::invalid_response("daemon response had an invalid status code"))?;

    Ok(Response {
        status_code,
        body: bytes[header_end + 4..].to_vec(),
    })
}

fn decode_api_error(response: Response) -> CliError {
    if let Ok(parsed) = serde_json::from_slice::<ApiErrorEnvelope>(&response.body) {
        return CliError::Api {
            status: response.status_code,
            code: Some(parsed.error.code),
            message: parsed.error.message,
        };
    }

    let fallback = String::from_utf8_lossy(&response.body).trim().to_string();
    CliError::Api {
        status: response.status_code,
        code: None,
        message: if fallback.is_empty() {
            "daemon returned an error without a response body".to_string()
        } else {
            fallback
        },
    }
}

#[cfg(test)]
mod tests {
    use super::Endpoint;

    #[test]
    fn parses_ipv4_daemon_url() {
        let endpoint = Endpoint::parse("http://127.0.0.1:9999").expect("parse");
        assert_eq!(endpoint.host, "127.0.0.1");
        assert_eq!(endpoint.port, 9999);
        assert_eq!(endpoint.authority, "127.0.0.1:9999");
    }

    #[test]
    fn parses_ipv6_daemon_url() {
        let endpoint = Endpoint::parse("http://[::1]:9999").expect("parse");
        assert_eq!(endpoint.host, "::1");
        assert_eq!(endpoint.port, 9999);
        assert_eq!(endpoint.authority, "[::1]:9999");
    }

    #[test]
    fn rejects_non_http_scheme() {
        assert!(Endpoint::parse("https://127.0.0.1:9999").is_err());
    }

    #[test]
    fn rejects_paths_in_daemon_url() {
        assert!(Endpoint::parse("http://127.0.0.1:9999/api").is_err());
    }
}
