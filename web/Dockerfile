FROM node:20-slim

WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Copy application code
COPY . .

CMD ["npm", "run", "dev", "--", "--hostname", "0.0.0.0", "--port", "3000"]
