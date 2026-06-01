# Remote Runtime

Local wrapper for detecting Typecho installations, deploying the PHP agent, and invoking agent methods through SSH.

Current execution modes:

- `host_php`: Typecho is available directly on the SSH host and `php` exists on the host.
- `docker_exec`: Typecho runs in Docker and the local service can execute `php` inside the container.

