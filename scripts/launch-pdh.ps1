# ====================================================================
#  PINAKA DELIVERY HUB (PDH) — MASTER ONE-CLICK SYSTEM LAUNCHER
# ====================================================================

Write-Host "========================================================" -ForegroundColor Cyan
Write-Host " LAUNCHING PINAKA DELIVERY HUB SYSTEM INFRASTRUCTURE " -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan

$WorkspaceRoot = Split-Path -Parent $PSScriptRoot
$TsxCommand = Join-Path $WorkspaceRoot "node_modules\.bin\tsx.cmd"

if (-not (Test-Path -LiteralPath $TsxCommand)) {
    Write-Host "tsx is not installed. Run 'pnpm install --frozen-lockfile' first." -ForegroundColor Red
    exit 1
}

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
    Start-Process powershell -WorkingDirectory $WorkspaceRoot -ArgumentList "-NoExit", "-Command", "Write-Host 'Booting $Name (Port $Port)...' -ForegroundColor Cyan; & '$TsxCommand' $Command"
}

# 3. Launching application services
Start-Microservice -Name "Gateway UI" -Command "'apps/gateway/src/main.ts'" -Port 3000
Start-Microservice -Name "Connector Service" -Command "'apps/connector-service/src/main.ts'" -Port 3001
Start-Microservice -Name "Order Service" -Command "'apps/order-service/src/main.ts'" -Port 3002
Start-Microservice -Name "Merchant Service" -Command "'apps/merchant-service/src/main.ts'" -Port 3003
Start-Microservice -Name "Menu Service" -Command "'apps/menu-service/src/main.ts'" -Port 3004
Start-Microservice -Name "Inventory Service" -Command "'apps/inventory-service/src/main.ts'" -Port 3005
Start-Microservice -Name "Analytics Service" -Command "'apps/analytics-service/src/main.ts'" -Port 3006
Start-Microservice -Name "POS Integration Service" -Command "'apps/pos-integration-service/src/main.ts'" -Port 3007
Start-Microservice -Name "Notification Service" -Command "'apps/notification-service/src/main.ts'" -Port 3008
Start-Microservice -Name "Admin API" -Command "'apps/admin-api/src/main.ts'" -Port 3009
Start-Microservice -Name "Auth Service" -Command "'apps/auth-service/src/main.ts'" -Port 3010

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
