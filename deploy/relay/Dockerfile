FROM rust:1.76 as build
WORKDIR /app
COPY . .
RUN cargo build -p relay-server --release

FROM debian:bookworm-slim
WORKDIR /app
COPY --from=build /app/target/release/relay-server /app/relay-server
EXPOSE 7777
ENTRYPOINT ["/app/relay-server", "--bind", "0.0.0.0:7777"]
