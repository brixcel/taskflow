# ==============================================================================
# SyncTask Networking Module — VPC, Multi-AZ Subnets, Routing & Security Groups
# ==============================================================================

# ── 1. Virtual Private Cloud (VPC) ────────────────────────────────────────────

resource "aws_vpc" "main" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-vpc"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# ── 2. Internet Gateway (IGW) ──────────────────────────────────────────────────

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-igw"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# ── 3. Public Subnets (ALB & NAT Gateways) ─────────────────────────────────────

resource "aws_subnet" "public" {
  count                   = length(var.public_subnet_cidrs)
  vpc_id                  = aws_vpc.main.id
  cidr_block              = var.public_subnet_cidrs[count.index]
  availability_zone       = var.availability_zones[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-public-${var.availability_zones[count.index]}"
    Type        = "public"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# ── 4. Elastic IPs & NAT Gateways (Outbound Internet for Private App Subnets) ──

resource "aws_eip" "nat" {
  count  = var.environment == "production" ? length(var.public_subnet_cidrs) : 1
  domain = "vpc"

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-nat-eip-${count.index + 1}"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_nat_gateway" "main" {
  count         = var.environment == "production" ? length(var.public_subnet_cidrs) : 1
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-nat-gw-${count.index + 1}"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })

  depends_on = [aws_internet_gateway.main]
}

# ── 5. Private Application Subnets (ECS Fargate Services) ─────────────────────

resource "aws_subnet" "private_app" {
  count             = length(var.private_app_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_app_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-app-${var.availability_zones[count.index]}"
    Type        = "private-app"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# ── 6. Private Database Subnets (RDS PostgreSQL Isolated) ─────────────────────

resource "aws_subnet" "private_db" {
  count             = length(var.private_db_subnet_cidrs)
  vpc_id            = aws_vpc.main.id
  cidr_block        = var.private_db_subnet_cidrs[count.index]
  availability_zone = var.availability_zones[count.index]

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-db-${var.availability_zones[count.index]}"
    Type        = "private-db"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# ── 7. Route Tables & Associations ─────────────────────────────────────────────

# Public Route Table -> IGW
resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-public-rt"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

resource "aws_route_table_association" "public" {
  count          = length(aws_subnet.public)
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

# Private App Route Tables -> NAT Gateway
resource "aws_route_table" "private_app" {
  count  = length(var.private_app_subnet_cidrs)
  vpc_id = aws_vpc.main.id

  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = var.environment == "production" ? aws_nat_gateway.main[count.index].id : aws_nat_gateway.main[0].id
  }

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-app-rt-${count.index + 1}"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

resource "aws_route_table_association" "private_app" {
  count          = length(aws_subnet.private_app)
  subnet_id      = aws_subnet.private_app[count.index].id
  route_table_id = aws_route_table.private_app[count.index].id
}

# Private Database Route Table -> Completely Isolated (Zero Internet Route)
resource "aws_route_table" "private_db" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-db-rt"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

resource "aws_route_table_association" "private_db" {
  count          = length(aws_subnet.private_db)
  subnet_id      = aws_subnet.private_db[count.index].id
  route_table_id = aws_route_table.private_db.id
}

# ── 8. Security Groups (Least-Privilege Ingress/Egress Isolation) ───────────────

# ALB Security Group: Ingress 80/443 from Internet, Egress to ECS
resource "aws_security_group" "alb" {
  name        = "${var.project_name}-${var.environment}-alb-sg"
  description = "Controls HTTP/HTTPS ingress to Application Load Balancer"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTP Inbound (Redirect to HTTPS)"
    from_port   = 80
    to_port     = 80
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    description = "HTTPS Inbound"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    description = "Outbound to all destinations"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-alb-sg"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# ECS Security Group: Ingress container port strictly from ALB SG
resource "aws_security_group" "ecs" {
  name        = "${var.project_name}-${var.environment}-ecs-sg"
  description = "Controls ingress to SyncTask ECS Fargate containers"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "Ingress container port strictly from ALB"
    from_port       = var.container_port
    to_port         = var.container_port
    protocol        = "tcp"
    security_groups = [aws_security_group.alb.id]
  }

  egress {
    description = "Outbound to internet for external APIs, SMTP, Webhooks, and DB"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-ecs-sg"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

# RDS Security Group: Ingress 5432 strictly from ECS SG
resource "aws_security_group" "db" {
  name        = "${var.project_name}-${var.environment}-db-sg"
  description = "Controls ingress to SyncTask RDS PostgreSQL instance"
  vpc_id      = aws_vpc.main.id

  ingress {
    description     = "PostgreSQL port strictly from ECS Fargate tasks"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [aws_security_group.ecs.id]
  }

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-db-sg"
    Environment = var.environment
    ManagedBy   = "Terraform"
  })
}

