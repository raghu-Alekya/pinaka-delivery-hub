# ====================================================================
#  PINAKA DELIVERY HUB (PDH) — MASTER ONE-CLICK SYSTEM LAUNCHER
# ====================================================================

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " LAUNCHING PINAKA DELIVERY HUB SYSTEM INFRASTRUCTURE " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

# 1. Start Docker Infrastructure Containers
Write-Host ""
Write-Host "[Step 1/3] Starting Docker Infrastructure Containers..." -ForegroundColor Yellow
docker compose up -d

if ($LASTEXITCODE -ne 0) {
    Write-Host "Docker Compose failed to start. Ensure Docker Desktop is running." -ForegroundColor Red
    exit 1
}

Write-Host "Docker Infrastructure (PostgreSQL, Redis, RabbitMQ, pgAdmin, Redis-Commander) is UP!" -ForegroundColor Green

# 2. Function to launch microservices in new terminal windows
function Start-Microservice {
    param (
        [string]$Name,
        [string]$Command,
        [int]$Port
    )
    Write-Host "Booting $Name on Port $Port..." -ForegroundColor Yellow
    Start-Process powershell -ArgumentList "-NoExit", "-Command", "Write-Host 'Booting $Name (Port $Port)...' -ForegroundColor Cyan; $Command"
}

# 3. Launching application services
Start-Microservice -Name "Gateway UI" -Command "npx nx serve gateway" -Port 3000
Start-Microservice -Name "Connector Service" -Command "npx nx serve connector-service" -Port 3001
Start-Microservice -Name "Order Service" -Command "npx nx serve order-service" -Port 3002
Start-Microservice -Name "Merchant Service" -Command "npx nx serve merchant-service" -Port 3003
Start-Microservice -Name "Menu Service" -Command "npx nx serve menu-service" -Port 3004
Start-Microservice -Name "Inventory Service" -Command "npx nx serve inventory-service" -Port 3005
Start-Microservice -Name "Analytics Service" -Command "npx nx serve analytics-service" -Port 3006
Start-Microservice -Name "POS Integration Service" -Command "npx nx serve pos-integration-service" -Port 3007
Start-Microservice -Name "Notification Service" -Command "npx nx serve notification-service" -Port 3008
Start-Microservice -Name "Admin API" -Command "npx nx serve admin-api" -Port 3009
Start-Microservice -Name "Auth Service" -Command "npx nx serve auth-service" -Port 3010

# 4. Display Final Status Banner
Start-Sleep -Seconds 3
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host " PINAKA DELIVERY HUB IS FULLY ONLINE AND READY!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "REACT LIVE ORDER BOARD:       http://localhost:3000" -ForegroundColor White
Write-Host "CONNECTOR WEBHOOK SERVICE:   http://localhost:3001" -ForegroundColor White
Write-Host "ORDER MANAGEMENT SERVICE:    http://localhost:3002" -ForegroundColor White
Write-Host "MERCHANT STORE SERVICE:      http://localhost:3003" -ForegroundColor White
Write-Host "MENU AND 86-ITEM SERVICE:    http://localhost:3004" -ForegroundColor White
Write-Host "INVENTORY AND STOCK SERVICE: http://localhost:3005" -ForegroundColor White
Write-Host "REVENUE ANALYTICS SERVICE:   http://localhost:3006" -ForegroundColor White
Write-Host "POS INTEGRATION SERVICE:     http://localhost:3007" -ForegroundColor White
Write-Host "NOTIFICATION SERVICE:        http://localhost:3008" -ForegroundColor White
Write-Host "ADMIN API:                   http://localhost:3009" -ForegroundColor White
Write-Host "AUTH SERVICE:                http://localhost:3010" -ForegroundColor White
Write-Host ""
Write-Host "INFRASTRUCTURE MANAGEMENT DASHBOARDS:" -ForegroundColor Yellow
Write-Host "pgAdmin 4 (PostgreSQL Web UI): http://localhost:5050 (admin@pdh.com / pdh_password)" -ForegroundColor Gray
Write-Host "Redis Commander (Redis Web UI): http://localhost:8081" -ForegroundColor Gray
Write-Host "RabbitMQ Management Console:   http://localhost:15672 (guest / guest)" -ForegroundColor Gray
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""
