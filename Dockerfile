FROM alpine:3.21

RUN apk add --no-cache \
    bash \
    net-tools

RUN mkdir -p /cyberai

# Copy the architecture-specific binary
COPY bins/cyberai-linux-arm64 /bin/cyberai

# Make binary executable
RUN chmod +x /bin/cyberai

WORKDIR /cyberai

EXPOSE 8080
CMD ["/bin/cyberai"]