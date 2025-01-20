# Use a base image that supports ARM architecture
FROM node:18-bullseye-slim

# Install necessary packages for Chromium
RUN apt-get update && apt-get install -y \
    wget \
    curl \
    gnupg \
    ca-certificates \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Install Chromium (this will ensure it's compatible with Puppeteer)
RUN apt-get update && apt-get install -y \
    chromium \
    --no-install-recommends && \
    rm -rf /var/lib/apt/lists/*

# Set the working directory in the container
WORKDIR /app

# Copy the package.json and package-lock.json files to the container
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of your application files
COPY . .

EXPOSE 3000

CMD ["node", "index.mjs"]