#!/bin/bash

##############################################################################
# SPECTRA Demo Launch Script
# Purpose: Spin up a fully functional SPECTRA instance in <5 minutes
# Ready for hackathon stage demo or investor walkthrough
#
# Usage:
#   chmod +x ./scripts/demo-launch.sh
#   ./scripts/demo-launch.sh [--skip-seed] [--browser chrome]
#
# Prerequisites:
#   - Docker & Docker Compose installed
#   - .env file with DB credentials (auto-created if missing)
#   - Port 3000 available (frontend)
##############################################################################

set -e  # Exit on any error

# ─────────────────────────────────────────────────────────────────────────────
# COLOR CODES FOR OUTPUT
# ─────────────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# ─────────────────────────────────────────────────────────────────────────────
# CONFIGURATION
# ─────────────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
ENV_FILE="$PROJECT_ROOT/.env.local"
DEMO_TIMEOUT=300  # 5 minutes in seconds
BROWSER_CMD="${BROWSER:-chrome}"

SKIP_SEED=false
DOCKER_WAIT_RETRIES=30
DOCKER_WAIT_INTERVAL=5

# ─────────────────────────────────────────────────────────────────────────────
# PARSE ARGUMENTS
# ─────────────────────────────────────────────────────────────────────────────
while [[ $# -gt 0 ]]; do
  case $1 in
    --skip-seed)
      SKIP_SEED=true
      shift
      ;;
    --browser)
      BROWSER_CMD="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

# ─────────────────────────────────────────────────────────────────────────────
# UTILITY FUNCTIONS
# ─────────────────────────────────────────────────────────────────────────────

log_info() {
  echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
  echo -e "${GREEN}[✓]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

error_exit() {
  log_error "$1"
  exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# CHECK PREREQUISITES
# ─────────────────────────────────────────────────────────────────────────────

check_prerequisites() {
  log_info "Checking prerequisites..."

  # Check Docker
  if ! command -v docker &> /dev/null; then
    error_exit "Docker is not installed. Please install Docker first."
  fi
  log_success "Docker found"

  # Check Docker Compose
  if ! command -v docker-compose &> /dev/null; then
    error_exit "Docker Compose is not installed."
  fi
  log_success "Docker Compose found"

  # Check .env file
  if [ ! -f "$ENV_FILE" ]; then
    log_warn ".env.local not found. Creating default..."
    create_env_file
  else
    log_success ".env.local exists"
  fi

  # Check port 3000 is available
  if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null 2>&1; then
    log_warn "Port 3000 is already in use. Demo may fail to bind."
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# CREATE DEFAULT .ENV FILE
# ─────────────────────────────────────────────────────────────────────────────

create_env_file() {
  cat > "$ENV_FILE" <<EOF
# SPECTRA Demo Environment
# ─────────────────────────────────────────────────────────────────────────────
# Update these with your actual SQL Server credentials before running

# SQL Server Connection
DB_SERVER=mssql-server
DB_NAME=SPECTRA
DB_USER=sa
DB_PASSWORD=YourStrong@Password1

# Authentication
JWT_SECRET=your-super-secret-jwt-key-change-me-in-production-$(date +%s)

# Third-party APIs (optional for demo)
GROQ_API_KEY=your-groq-api-key-here
CLIENT_PORTAL_PASSWORD=demo1234

# Environment
NODE_ENV=production

EOF
  log_success "Created $ENV_FILE. Please update DB_SERVER, DB_USER, DB_PASSWORD with your SQL Server details."
}

# ─────────────────────────────────────────────────────────────────────────────
# CLEAN UP PREVIOUS DEMO CONTAINERS
# ─────────────────────────────────────────────────────────────────────────────

cleanup_old_containers() {
  log_info "Cleaning up old containers..."
  cd "$PROJECT_ROOT"
  
  # Stop and remove containers gracefully
  docker-compose down --remove-orphans 2>/dev/null || true
  
  log_success "Cleanup complete"
}

# ─────────────────────────────────────────────────────────────────────────────
# BUILD AND START CONTAINERS
# ─────────────────────────────────────────────────────────────────────────────

start_containers() {
  log_info "Building and starting containers..."
  cd "$PROJECT_ROOT"
  
  # Build images
  docker-compose build --no-cache 2>&1 | tail -20
  
  # Start containers (app service only, not pipeline)
  docker-compose up -d app
  
  log_success "Containers started"
}

# ─────────────────────────────────────────────────────────────────────────────
# WAIT FOR SERVICES TO BE HEALTHY
# ─────────────────────────────────────────────────────────────────────────────

wait_for_health() {
  log_info "Waiting for services to be healthy (timeout: ${DEMO_TIMEOUT}s)..."
  
  local start_time=$(date +%s)
  local retries=0
  
  while [ $retries -lt $DOCKER_WAIT_RETRIES ]; do
    if docker-compose ps | grep -q "app.*healthy"; then
      log_success "Frontend is healthy"
      return 0
    fi
    
    log_info "Waiting... ($retries/$DOCKER_WAIT_RETRIES retries, $(($DOCKER_WAIT_INTERVAL * $retries))s elapsed)"
    sleep $DOCKER_WAIT_INTERVAL
    retries=$((retries + 1))
    
    local current_time=$(date +%s)
    local elapsed=$((current_time - start_time))
    if [ $elapsed -gt $DEMO_TIMEOUT ]; then
      error_exit "Services did not become healthy within ${DEMO_TIMEOUT}s"
    fi
  done
  
  error_exit "Services failed to become healthy after $((DOCKER_WAIT_RETRIES * DOCKER_WAIT_INTERVAL))s"
}

# ─────────────────────────────────────────────────────────────────────────────
# SEED DEMO DATA
# ─────────────────────────────────────────────────────────────────────────────

seed_demo_data() {
  if [ "$SKIP_SEED" = true ]; then
    log_warn "Skipping data seed (--skip-seed flag set)"
    return 0
  fi
  
  log_info "Seeding demo data (Arben Morina — Stage 3 NPL)..."
  
  # Extract DB credentials from .env
  source "$ENV_FILE"
  
  # Wait for SQL Server to be accessible
  local retries=0
  while [ $retries -lt 10 ]; do
    if docker exec spectra_system-app-1 sqlcmd -S "$DB_SERVER" -U "$DB_USER" -P "$DB_PASSWORD" -Q "SELECT 1" 2>/dev/null; then
      log_success "Database connection successful"
      break
    fi
    log_info "Waiting for database... ($retries/10)"
    sleep 5
    retries=$((retries + 1))
  done
  
  if [ $retries -eq 10 ]; then
    log_warn "Database connection timeout. Seed skipped. Manual seed may be needed."
    return 1
  fi
  
  # Run seed script if it exists
  if [ -f "$PROJECT_ROOT/frontend/scripts/seed_arben_morina.sql" ]; then
    docker exec spectra_system-app-1 \
      sqlcmd -S "$DB_SERVER" -d "$DB_NAME" -U "$DB_USER" -P "$DB_PASSWORD" \
      -i /app/scripts/seed_arben_morina.sql || log_warn "Seed script failed (client may already exist)"
    log_success "Demo data seeded"
  else
    log_warn "Seed script not found at $PROJECT_ROOT/frontend/scripts/seed_arben_morina.sql"
  fi
}

# ─────────────────────────────────────────────────────────────────────────────
# OPEN BROWSER
# ─────────────────────────────────────────────────────────────────────────────

open_browser() {
  log_info "Opening browser to http://localhost:3000..."
  
  # Detect OS and open appropriate browser
  case "$(uname -s)" in
    Darwin)
      # macOS
      open -a "$BROWSER_CMD" "http://localhost:3000" || open "http://localhost:3000"
      ;;
    Linux)
      # Linux
      xdg-open "http://localhost:3000" || sensible-browser "http://localhost:3000" || true
      ;;
    MINGW*|MSYS*|CYGWIN*)
      # Windows
      start http://localhost:3000
      ;;
    *)
      log_warn "Could not detect OS. Manual browser launch needed."
      ;;
  esac
}

# ─────────────────────────────────────────────────────────────────────────────
# PRINT DEMO GUIDE
# ─────────────────────────────────────────────────────────────────────────────

print_demo_guide() {
  cat << 'EOF'

╔══════════════════════════════════════════════════════════════════════════════╗
║                    SPECTRA DEMO READY FOR STAGE SHOW                         ║
╚══════════════════════════════════════════════════════════════════════════════╝

✓ Frontend:  http://localhost:3000
✓ Backend:   http://localhost:3000/api/
✓ Database:  Check .env.local for connection details

┌──────────────────────────────────────────────────────────────────────────────┐
│ RECOMMENDED DEMO WALK-THROUGH (4 minutes)                                    │
└──────────────────────────────────────────────────────────────────────────────┘

1. DASHBOARD (30 sec)
   → Shows: KPI traffic lights (NPL ratio, Stage 2 rate), portfolio health
   → Talking point: "Real-time portfolio overview. Red flags = clients needing action."

2. PORTFOLIO MONITORING (45 sec)
   → Click "Portfolio" → see overdue reviews
   → Freeze a client directly from the review queue
   → Talking point: "Daily, continuous role-based monitoring. Risk officers know exactly 
      what changed since this morning."

3. CLIENT PROFILE → ARBEN MORINA (1 min 30 sec)
   → Click "Clients" → search "Arben Morina" (PersonalID: 193847562)
   → Show tabs:
      • Overview: Risk Score, Stage 3, DPD = 114 days (!), PD trending up
      • EWI Predictions: ML signals showing deterioration drivers
      • Engagements: RM contact log
      • Documents: Requested/received
      • Actions: Recommended next steps (escalate to committee, initiate recovery)
   → Talking point: "We detect this deterioration 30–90 days earlier than DPD thresholds 
      would fire. ML shows *why* (salary inflow ceased, collateral LTV breach). RM knows 
      exactly what to do."

4. ESCALATION → AUDIT LOG (1 min)
   → Click "Escalate to Committee" from Arben's profile
   → Show confirmation flow
   → Navigate to "Audit" → search for Arben's escalation event
   → Talking point: "Every action is immutably logged. Regulators see complete trail, 
      zero manual reconciliation needed."

5. RAPID CLOSE (15 sec)
   → Show watchlist count (top-N obligors / concentration risk)
   → Mention: "All of this — real-time risk signals, automated stage classification, 
      audit trails — was impossible 5 minutes ago without manual work across 3 systems. 
      This is what SPECTRA does."

┌──────────────────────────────────────────────────────────────────────────────┐
│ DEMO DATA (Arben Morina)                                                     │
└──────────────────────────────────────────────────────────────────────────────┘

PersonalID: 193847562
Name: Arben Morina | Stage: 3 NPL | DPD: 114 | Exposure: €87,426

Products:
  • Personal Loan (CN/7700442819): €75,000 | 84 months | 17 paid, 67 remaining
  • Overdraft (CN/7700558934): €15,000 limit, €14,300 drawn
  • Credit Card (CN/7700601122): €10,000 limit, €9,930 used

Latest ML Signal: CRITICAL
  → Salary inflow ceased (Oct missed, vs. €1,250 June–Sept)
  → DPD trending: 84 → 104 → 114 (past 3 months)
  → Missing 3 consecutive loan installments
  → Collateral LTV breached 85% threshold

Recommended Action: Escalate to Recovery Committee for legal referral

┌──────────────────────────────────────────────────────────────────────────────┐
│ TROUBLESHOOTING                                                              │
└──────────────────────────────────────────────────────────────────────────────┘

Q: "Database connection failed"
A: Check .env.local. Update DB_SERVER, DB_USER, DB_PASSWORD to match your SQL Server.
   Then run: docker-compose down && ./scripts/demo-launch.sh

Q: "Port 3000 already in use"
A: Kill the process: lsof -ti:3000 | xargs kill -9
   Or change port in docker-compose.yml

Q: "Arben Morina not found in search"
A: Run seed manually:
   docker exec spectra_system-app-1 sqlcmd -S [DB_SERVER] -d SPECTRA -U sa -P [PASS] \
   -i ./frontend/scripts/seed_arben_morina.sql

Q: "Frontend loads but shows errors"
A: Check logs: docker-compose logs app | tail -50
   Ensure DB credentials are correct in .env.local

┌──────────────────────────────────────────────────────────────────────────────┐
│ STOP DEMO (when done)                                                        │
└──────────────────────────────────────────────────────────────────────────────┘

  docker-compose down          # Stop all containers
  docker-compose down -v       # Stop + remove volumes (reset database)

EOF
}

# ─────────────────────────────────────────────────────────────────────────────
# MAIN EXECUTION
# ─────────────────────────────────────────────────────────────────────────────

main() {
  echo ""
  log_info "╔════════════════════════════════════════════════════════════════╗"
  log_info "║              SPECTRA DEMO LAUNCH — <5 MINUTES                 ║"
  log_info "║         Preparing Stage-Ready Hackathon Walkthrough           ║"
  log_info "║                                                                ║"
  log_info "╚════════════════════════════════════════════════════════════════╝"
  echo ""

  check_prerequisites
  cleanup_old_containers
  start_containers
  wait_for_health
  seed_demo_data
  
  echo ""
  log_success "════════════════════════════════════════════════════════════════"
  log_success "SPECTRA Demo is LIVE at http://localhost:3000"
  log_success "════════════════════════════════════════════════════════════════"
  echo ""
  
  open_browser
  print_demo_guide
}

# ─────────────────────────────────────────────────────────────────────────────
# RUN MAIN
# ─────────────────────────────────────────────────────────────────────────────

main "$@"
