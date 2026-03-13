use serde_json::{json, Value};

use crate::errors::CliError;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum OutputFormat {
    Human,
    Json,
}

#[derive(Debug, Clone)]
pub struct CommandOutput {
    pub json: Value,
    pub human: String,
}

impl CommandOutput {
    pub fn new(json: Value, human: impl Into<String>) -> Self {
        Self {
            json,
            human: human.into(),
        }
    }
}

pub fn print_output(output: &CommandOutput, format: OutputFormat) -> Result<(), CliError> {
    match format {
        OutputFormat::Human => {
            if output.human.ends_with('\n') {
                print!("{}", output.human);
            } else {
                println!("{}", output.human);
            }
            Ok(())
        }
        OutputFormat::Json => {
            let rendered =
                serde_json::to_string_pretty(&output.json).map_err(CliError::RenderJson)?;
            println!("{rendered}");
            Ok(())
        }
    }
}

pub fn json_metrics(metrics: &str) -> Value {
    json!({
        "api_version": "v1",
        "metrics": metrics,
    })
}

pub fn bool_at(value: &Value, path: &[&str]) -> String {
    lookup(value, path)
        .and_then(Value::as_bool)
        .map(|item| item.to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

pub fn string_at(value: &Value, path: &[&str]) -> String {
    lookup(value, path)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "unknown".to_string())
}

pub fn optional_string_at(value: &Value, path: &[&str]) -> String {
    lookup(value, path)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .unwrap_or_else(|| "none".to_string())
}

pub fn number_at(value: &Value, path: &[&str]) -> String {
    let Some(item) = lookup(value, path) else {
        return "unknown".to_string();
    };
    if let Some(number) = item.as_u64() {
        return number.to_string();
    }
    if let Some(number) = item.as_i64() {
        return number.to_string();
    }
    if let Some(number) = item.as_f64() {
        return number.to_string();
    }
    "unknown".to_string()
}

pub fn array_len_at(value: &Value, path: &[&str]) -> usize {
    lookup(value, path)
        .and_then(Value::as_array)
        .map_or(0, Vec::len)
}

pub fn string_array_at(value: &Value, path: &[&str]) -> Vec<String> {
    lookup(value, path)
        .and_then(Value::as_array)
        .map(|items| {
            items
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default()
}

fn lookup<'a>(value: &'a Value, path: &[&str]) -> Option<&'a Value> {
    let mut current = value;
    for segment in path {
        current = current.get(*segment)?;
    }
    Some(current)
}
