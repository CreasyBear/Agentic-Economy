resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = merge(local.tags, { Name = var.name })
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${var.name}-egress" })
}

resource "aws_subnet" "public" {
  for_each                = local.public_subnets
  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = false
  tags                    = merge(local.tags, { Name = "${var.name}-public-${each.key}" })
}

resource "aws_subnet" "app" {
  for_each                = local.app_subnets
  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = false
  tags                    = merge(local.tags, { Name = "${var.name}-app-${each.key}" })
}

resource "aws_subnet" "database" {
  for_each                = local.database_subnets
  vpc_id                  = aws_vpc.this.id
  cidr_block              = each.value.cidr
  availability_zone       = each.value.az
  map_public_ip_on_launch = false
  tags                    = merge(local.tags, { Name = "${var.name}-database-${each.key}" })
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = merge(local.tags, { Name = "${var.name}-nat" })
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public["a"].id
  depends_on    = [aws_internet_gateway.this]
  tags          = merge(local.tags, { Name = "${var.name}-nat" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = merge(local.tags, { Name = "${var.name}-public" })
}

resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }
  tags = merge(local.tags, { Name = "${var.name}-private" })
}

resource "aws_route_table_association" "app" {
  for_each       = aws_subnet.app
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}

resource "aws_route_table" "database" {
  vpc_id = aws_vpc.this.id
  tags   = merge(local.tags, { Name = "${var.name}-database" })
}

resource "aws_route_table_association" "database" {
  for_each       = aws_subnet.database
  subnet_id      = each.value.id
  route_table_id = aws_route_table.database.id
}

resource "aws_security_group" "k3s" {
  name_prefix = "${var.name}-k3s-"
  description = "No ingress; Formance exits only through Cloudflare Tunnel"
  vpc_id      = aws_vpc.this.id

  tags = local.tags
}

resource "aws_security_group" "database" {
  name_prefix = "${var.name}-database-"
  description = "RDS accepts PostgreSQL only from the private k3s host"
  vpc_id      = aws_vpc.this.id

  tags = local.tags
}

resource "aws_vpc_security_group_egress_rule" "k3s_https" {
  security_group_id = aws_security_group.k3s.id
  description       = "TLS package, AWS API and tunnel traffic"
  ip_protocol       = "tcp"
  from_port         = 443
  to_port           = 443
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "k3s_http_packages" {
  security_group_id = aws_security_group.k3s.id
  description       = "Ubuntu package bootstrap"
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "k3s_dns_udp" {
  security_group_id = aws_security_group.k3s.id
  description       = "VPC DNS resolution"
  ip_protocol       = "udp"
  from_port         = 53
  to_port           = 53
  cidr_ipv4         = var.vpc_cidr
}

resource "aws_vpc_security_group_egress_rule" "k3s_dns_tcp" {
  security_group_id = aws_security_group.k3s.id
  description       = "VPC DNS fallback"
  ip_protocol       = "tcp"
  from_port         = 53
  to_port           = 53
  cidr_ipv4         = var.vpc_cidr
}

resource "aws_vpc_security_group_egress_rule" "k3s_quic" {
  security_group_id = aws_security_group.k3s.id
  description       = "Cloudflare Tunnel QUIC"
  ip_protocol       = "udp"
  from_port         = 7844
  to_port           = 7844
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "k3s_tunnel_tcp" {
  security_group_id = aws_security_group.k3s.id
  description       = "Cloudflare Tunnel TCP fallback"
  ip_protocol       = "tcp"
  from_port         = 7844
  to_port           = 7844
  cidr_ipv4         = "0.0.0.0/0"
}

resource "aws_vpc_security_group_egress_rule" "k3s_database" {
  security_group_id            = aws_security_group.k3s.id
  description                  = "Managed PostgreSQL"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.database.id
}

resource "aws_vpc_security_group_ingress_rule" "database_k3s" {
  security_group_id            = aws_security_group.database.id
  description                  = "PostgreSQL from the private k3s host"
  ip_protocol                  = "tcp"
  from_port                    = 5432
  to_port                      = 5432
  referenced_security_group_id = aws_security_group.k3s.id
}
