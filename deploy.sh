#!/bin/bash

# Deployment script for Pickford application
# This script checks for Docker and rebuilds the Docker Compose services

set -e

echo "=== Pickford Deployment Script ==="

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

echo "✅ Docker is installed: $(docker --version)"

# Check if Docker Compose is installed
if command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
    echo "✅ Docker Compose is installed: $(docker-compose --version)"
elif docker compose version &> /dev/null; then
    COMPOSE_CMD="docker compose"
    echo "✅ Docker Compose (plugin) is installed: $(docker compose version)"
else
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

# Check if docker-compose.yml exists
if [ ! -f "docker-compose.yml" ]; then
    echo "❌ docker-compose.yml not found in current directory."
    exit 1
fi

echo "✅ docker-compose.yml found"

# Stop existing containers
echo "🛑 Stopping existing containers..."
$COMPOSE_CMD down

# Pull latest changes (if in a git repository)
if [ -d ".git" ]; then
    echo "📥 Pulling latest changes..."
    git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || echo "⚠️  Could not pull changes (not on main/master branch or no remote)"
fi

# Build and start the services
echo "🔨 Building and starting Docker Compose services..."
$COMPOSE_CMD up --build -d

# Show running containers
echo "📋 Running containers:"
docker ps

echo "✅ Deployment completed successfully!"
echo "🌐 Frontend should be available at: http://localhost:8000"
echo "🔧 Backend API should be available at: http://localhost:3000"
echo "🗄️  MongoDB should be available at: localhost:27017"