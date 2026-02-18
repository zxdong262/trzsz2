# Ubuntu 24.04 based SSH server with trzsz support for integration testing
FROM ubuntu:24.04

# Avoid interactive prompts during package installation
ENV DEBIAN_FRONTEND=noninteractive

# Install SSH server and required packages
RUN apt-get update && apt-get install -y \
    openssh-server \
    sudo \
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# Install trzsz from PPA
RUN add-apt-repository ppa:trzsz/ppa && \
    apt-get update && \
    apt-get install -y trzsz && \
    rm -rf /var/lib/apt/lists/*

# Create SSH run directory
RUN mkdir -p /run/sshd

# Create user 'zxd' with password 'zxd' and add to sudo group
RUN useradd -m -s /bin/bash zxd && \
    echo 'zxd:zxd' | chpasswd && \
    usermod -aG sudo zxd

# Allow password authentication for SSH
RUN sed -i 's/#PasswordAuthentication yes/PasswordAuthentication yes/' /etc/ssh/sshd_config && \
    sed -i 's/#PermitRootLogin prohibit-password/PermitRootLogin no/' /etc/ssh/sshd_config

# Configure SSH to listen on port 22 (will be mapped to 24455)
RUN sed -i 's/#Port 22/Port 22/' /etc/ssh/sshd_config

# Create .ssh directory for zxd user
RUN mkdir -p /home/zxd/.ssh && \
    chown -R zxd:zxd /home/zxd/.ssh && \
    chmod 700 /home/zxd/.ssh

# Create downloads directory for trzsz
RUN mkdir -p /home/zxd/downloads && \
    chown -R zxd:zxd /home/zxd/downloads

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD sshd -t && pgrep sshd > /dev/null || exit 1

# Expose SSH port
EXPOSE 22

# Start SSH server
CMD ["/usr/sbin/sshd", "-D", "-e"]
