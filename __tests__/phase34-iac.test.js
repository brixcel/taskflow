const fs = require('fs');
const path = require('path');

const INFRA_DIR = path.resolve(__dirname, '../infra');

describe('Phase 34 — Infrastructure as Code (Terraform for SyncTask)', () => {
  describe('1. Directory Structure & File Hierarchy', () => {
    const requiredFiles = [
      'README.md',
      'modules/networking/main.tf',
      'modules/networking/variables.tf',
      'modules/networking/outputs.tf',
      'modules/database/main.tf',
      'modules/database/variables.tf',
      'modules/database/outputs.tf',
      'modules/compute/main.tf',
      'modules/compute/variables.tf',
      'modules/compute/outputs.tf',
      'modules/storage/main.tf',
      'modules/storage/variables.tf',
      'modules/storage/outputs.tf',
      'modules/monitoring/main.tf',
      'modules/monitoring/variables.tf',
      'modules/monitoring/outputs.tf',
      'environments/staging/main.tf',
      'environments/staging/variables.tf',
      'environments/staging/outputs.tf',
      'environments/staging/terraform.tfvars.example',
      'environments/production/main.tf',
      'environments/production/variables.tf',
      'environments/production/outputs.tf',
      'environments/production/terraform.tfvars.example',
    ];

    test.each(requiredFiles)('file %s exists and is non-empty', (relPath) => {
      const fullPath = path.join(INFRA_DIR, relPath);
      expect(fs.existsSync(fullPath)).toBe(true);
      const content = fs.readFileSync(fullPath, 'utf8');
      expect(content.trim().length).toBeGreaterThan(0);
    });
  });

  describe('2. Security & Zero-Credentials Enforcement', () => {
    function getAllTfFiles(dir) {
      let results = [];
      const list = fs.readdirSync(dir);
      list.forEach((file) => {
        const full = path.join(dir, file);
        const stat = fs.statSync(full);
        if (stat && stat.isDirectory()) {
          results = results.concat(getAllTfFiles(full));
        } else if (file.endsWith('.tf') || file.endsWith('.tfvars.example')) {
          results.push(full);
        }
      });
      return results;
    }

    test('no real plaintext AWS secret keys or production passwords committed', () => {
      const tfFiles = getAllTfFiles(INFRA_DIR);
      expect(tfFiles.length).toBeGreaterThanOrEqual(15);

      tfFiles.forEach((filePath) => {
        const content = fs.readFileSync(filePath, 'utf8');
        // Check for common real credential patterns
        expect(content).not.toMatch(/AKIA[0-9A-Z]{16}/); // AWS Access Key ID
        expect(content).not.toMatch(/ghp_[0-9a-zA-Z]{36}/); // GitHub Personal Access Token
        expect(content).not.toMatch(/AIzaSy[0-9A-Za-z_-]{33}/); // Real Google Gemini Key
      });
    });

    test('sensitive variables are flagged with sensitive = true', () => {
      const stagingVars = fs.readFileSync(path.join(INFRA_DIR, 'environments/staging/variables.tf'), 'utf8');
      const prodVars = fs.readFileSync(path.join(INFRA_DIR, 'environments/production/variables.tf'), 'utf8');
      const dbVars = fs.readFileSync(path.join(INFRA_DIR, 'modules/database/variables.tf'), 'utf8');

      expect(dbVars).toMatch(/variable\s+"database_password"[\s\S]*?sensitive\s*=\s*true/);
      expect(stagingVars).toMatch(/variable\s+"jwt_secret"[\s\S]*?sensitive\s*=\s*true/);
      expect(stagingVars).toMatch(/variable\s+"database_password"[\s\S]*?sensitive\s*=\s*true/);
      expect(prodVars).toMatch(/variable\s+"jwt_secret"[\s\S]*?sensitive\s*=\s*true/);
      expect(prodVars).toMatch(/variable\s+"gemini_api_key"[\s\S]*?sensitive\s*=\s*true/);
    });
  });

  describe('3. Networking & Security Group Ingress Chaining', () => {
    test('networking module defines 3-tier subnets and security group isolation', () => {
      const netMain = fs.readFileSync(path.join(INFRA_DIR, 'modules/networking/main.tf'), 'utf8');

      // 3-tier subnet resources
      expect(netMain).toContain('resource "aws_subnet" "public"');
      expect(netMain).toContain('resource "aws_subnet" "private_app"');
      expect(netMain).toContain('resource "aws_subnet" "private_db"');

      // Security groups
      expect(netMain).toContain('resource "aws_security_group" "alb"');
      expect(netMain).toContain('resource "aws_security_group" "ecs"');
      expect(netMain).toContain('resource "aws_security_group" "db"');

      // Ingress chaining: ECS only allows from ALB SG, DB only allows from ECS SG
      expect(netMain).toMatch(/resource\s+"aws_security_group"\s+"ecs"[\s\S]*?security_groups\s*=\s*\[aws_security_group\.alb\.id\]/);
      expect(netMain).toMatch(/resource\s+"aws_security_group"\s+"db"[\s\S]*?security_groups\s*=\s*\[aws_security_group\.ecs\.id\]/);
    });

    test('database security group does not allow public 0.0.0.0/0 ingress', () => {
      const netMain = fs.readFileSync(path.join(INFRA_DIR, 'modules/networking/main.tf'), 'utf8');
      const dbSgBlock = netMain.match(/resource\s+"aws_security_group"\s+"db"[\s\S]*?tags\s*=/)?.[0] || '';

      expect(dbSgBlock).toContain('from_port       = 5432');
      expect(dbSgBlock).not.toContain('0.0.0.0/0');
    });

  });

  describe('4. Database & Storage Modules Compliance', () => {
    test('database module enforces SSL, KMS encryption, and parameter groups', () => {
      const dbMain = fs.readFileSync(path.join(INFRA_DIR, 'modules/database/main.tf'), 'utf8');

      expect(dbMain).toContain('resource "aws_db_parameter_group" "main"');
      expect(dbMain).toContain('name  = "rds.force_ssl"');
      expect(dbMain).toContain('value = "1"');
      expect(dbMain).toContain('storage_encrypted      = true');
      expect(dbMain).toContain('resource "aws_kms_key" "database"');
      expect(dbMain).toContain('publicly_accessible    = false');
    });

    test('storage module enforces S3 public access block, versioning, and KMS', () => {
      const storageMain = fs.readFileSync(path.join(INFRA_DIR, 'modules/storage/main.tf'), 'utf8');

      expect(storageMain).toContain('resource "aws_s3_bucket_public_access_block" "attachments"');
      expect(storageMain).toContain('block_public_acls       = true');
      expect(storageMain).toContain('block_public_policy     = true');
      expect(storageMain).toContain('ignore_public_acls      = true');
      expect(storageMain).toContain('restrict_public_buckets = true');
      expect(storageMain).toContain('resource "aws_s3_bucket_server_side_encryption_configuration" "attachments"');
      expect(storageMain).toContain('resource "aws_s3_bucket_versioning" "attachments"');
    });
  });

  describe('5. Compute & Monitoring Modules Integration', () => {
    test('compute module configures ECS Fargate, ALB, CloudWatch logging, and autoscaling', () => {
      const compMain = fs.readFileSync(path.join(INFRA_DIR, 'modules/compute/main.tf'), 'utf8');

      expect(compMain).toContain('resource "aws_ecs_cluster" "main"');
      expect(compMain).toContain('resource "aws_ecs_task_definition" "app"');
      expect(compMain).toContain('resource "aws_ecs_service" "app"');
      expect(compMain).toContain('resource "aws_lb" "main"');
      expect(compMain).toContain('resource "aws_appautoscaling_policy" "ecs_cpu"');
      expect(compMain).toContain('resource "aws_appautoscaling_policy" "ecs_memory"');
      expect(compMain).toContain('logDriver = "awslogs"');
      expect(compMain).toContain('requires_compatibilities = ["FARGATE"]');
    });

    test('monitoring module defines CloudWatch alarms for CPU, Memory, 5XX, Latency, and Database', () => {
      const monMain = fs.readFileSync(path.join(INFRA_DIR, 'modules/monitoring/main.tf'), 'utf8');

      expect(monMain).toContain('resource "aws_cloudwatch_metric_alarm" "ecs_high_cpu"');
      expect(monMain).toContain('resource "aws_cloudwatch_metric_alarm" "ecs_high_memory"');
      expect(monMain).toContain('resource "aws_cloudwatch_metric_alarm" "alb_5xx_errors"');
      expect(monMain).toContain('resource "aws_cloudwatch_metric_alarm" "alb_high_latency"');
      expect(monMain).toContain('resource "aws_cloudwatch_metric_alarm" "rds_high_cpu"');
      expect(monMain).toContain('resource "aws_cloudwatch_metric_alarm" "rds_low_storage"');
      expect(monMain).toContain('resource "aws_cloudwatch_metric_alarm" "rds_high_connections"');
      expect(monMain).toContain('resource "aws_sns_topic" "alerts"');
    });
  });

  describe('6. Environment Specific Configurations (Staging vs Production)', () => {
    test('staging environment is configured for cost efficiency', () => {
      const stagingMain = fs.readFileSync(path.join(INFRA_DIR, 'environments/staging/main.tf'), 'utf8');

      expect(stagingMain).toContain('instance_class          = "db.t4g.micro"');
      expect(stagingMain).toContain('multi_az                = false');
      expect(stagingMain).toContain('backup_retention_period = 7');
      expect(stagingMain).toContain('deletion_protection     = false');
    });

    test('production environment is configured for high availability, security, and compliance', () => {
      const prodMain = fs.readFileSync(path.join(INFRA_DIR, 'environments/production/main.tf'), 'utf8');

      expect(prodMain).toContain('multi_az                = true');
      expect(prodMain).toContain('backup_retention_period = 30');
      expect(prodMain).toContain('deletion_protection     = true');
      expect(prodMain).toContain('resource "aws_wafv2_web_acl" "alb"');
      expect(prodMain).toContain('rule {\n    name     = "RateLimitRule"');
      expect(prodMain).toContain('rule {\n    name     = "AWSManagedRulesCommonRuleSet"');
      expect(prodMain).toContain('resource "aws_wafv2_web_acl_association" "alb"');
    });
  });
});
