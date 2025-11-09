# AWS Cost Optimization Guide

**Date:** November 9, 2025  
**Environment:** Staging (katechat.tech)  
**Current Monthly Cost:** ~$160 USD (including tax)  
**Optimized Monthly Cost:** ~$75-90 USD (including tax)  
**Estimated Savings:** ~$70-85 USD/month (~50% reduction)

## Changes Applied

### 1. Database (RDS) - Save ~$11/month
- **Before:** `db.t3.micro` (x86_64, $21.59/month)
- **After:** `db.t4g.micro` (ARM Graviton2, ~$11/month)
- **Impact:** ~20% cheaper, same performance
- **Downtime:** 5-15 minutes during migration

### 2. Redis (ElastiCache) - Save ~$9/month
- **Before:** `cache.t2.micro` ($17.78/month)
- **After:** `cache.t4g.micro` (~$9/month)
- **Impact:** ~50% cheaper with better performance
- **Downtime:** 5-10 minutes during migration

### 3. ECS Services - Save ~$13/month
- **Before:** 2 app instances × 512MB
- **After:** 1 app instance × 512MB
- **Impact:** Sufficient for staging environment
- **Note:** Document processor remains at 0 (on-demand only)

### 4. CloudWatch Logs - Save ~$3-5/month
- **Before:** 7 days (staging), 30 days (production)
- **After:** 3 days (staging), 7 days (production)
- **Impact:** Reduced log storage costs

### 5. ECR Image Storage - Save ~$5/month
- **Before:** Keep 15 tagged images, 3 days untagged
- **After:** Keep 5 tagged images, 1 day untagged
- **Impact:** ~75% reduction in image storage

## Cost Breakdown

| Service | Current | Optimized | Savings |
|---------|---------|-----------|---------|
| RDS (PostgreSQL) | $21.59 | $11.00 | $10.59 |
| ElastiCache (Redis) | $17.78 | $9.00 | $8.78 |
| ECS (Fargate) | $26.59 | $13.30 | $13.29 |
| ALB | $25.30 | $25.30 | $0.00 |
| VPC | $18.77 | $0.00* | $18.77 |
| ECR | $6.63 | $1.50 | $5.13 |
| CloudWatch | $8.44 | $3.00 | $5.44 |
| Secrets Manager | $4.38 | $4.38 | $0.00 |
| Bedrock | $0.56 | $0.56 | $0.00 |
| Route 53 | $1.00 | $1.00 | $0.00 |
| **Subtotal** | **$131** | **$69** | **$62** |
| Tax (21%) | $27.51 | $14.49 | $13.02 |
| **TOTAL** | **$158** | **$84** | **$75** |

*VPC costs should be ~$0 with `use_private_networks = false` (no NAT Gateway)

## Migration Plan

### Pre-Migration Checklist
- [ ] Review current Terraform state: `terraform plan`
- [ ] Create manual RDS snapshot for safety
- [ ] Notify users of potential 15-20 minute downtime window
- [ ] Backup important data/configurations

### Migration Steps

```bash
# 1. Navigate to Terraform directory
cd infrastructure/terraform

# 2. Create pre-migration RDS snapshot (safety)
aws rds create-db-snapshot \
  --db-instance-identifier katechat-staging-db \
  --db-snapshot-identifier katechat-pre-optimization-$(date +%Y%m%d-%H%M)

# 3. Review planned changes
terraform plan

# 4. Apply changes (expect 15-20 min downtime)
terraform apply

# 5. Verify all services are healthy
aws ecs list-services --cluster katechat-staging-cluster
aws rds describe-db-instances --db-instance-identifier katechat-staging-db
aws elasticache describe-cache-clusters --cache-cluster-id katechat-staging-redis
```

### Post-Migration Verification

```bash
# 1. Check RDS instance is running
aws rds describe-db-instances \
  --db-instance-identifier katechat-staging-db \
  --query 'DBInstances[0].[DBInstanceStatus,DBInstanceClass]'

# 2. Check ElastiCache is available
aws elasticache describe-cache-clusters \
  --cache-cluster-id katechat-staging-redis \
  --query 'CacheClusters[0].[CacheClusterStatus,CacheNodeType]'

# 3. Check ECS services are running
aws ecs describe-services \
  --cluster katechat-staging-cluster \
  --services katechat-staging-app-service \
  --query 'services[0].[runningCount,desiredCount]'

# 4. Test application health
curl -I https://katechat.tech/health
```

## Additional Optimization Opportunities

### Short-term (Implement later)
1. **Migrate Secrets Manager → Parameter Store**
   - Save: ~$4/month
   - Effort: 1-2 hours
   - Risk: Low

2. **Enable S3 Intelligent-Tiering**
   - Save: Variable (based on access patterns)
   - Effort: 30 minutes
   - Risk: None

3. **Schedule document-processor to run only during business hours**
   - Save: Variable
   - Effort: 2-3 hours (implement Lambda scheduler)
   - Risk: Medium

### Long-term (Consider for future)
1. **CloudFront CDN for static assets**
   - Reduce ALB costs
   - Improve global performance
   - Save: ~$10-15/month

2. **Aurora Serverless v2** (if traffic is variable)
   - Save: 20-50% on database costs
   - Only pay for actual usage
   - Good for variable workloads

3. **Spot Instances for document-processor**
   - Save: 70% on document processing
   - Requires fault-tolerant design

## Rollback Plan

If issues occur after migration:

```bash
# 1. Restore previous Terraform state
terraform plan -target=aws_db_instance.main
terraform plan -target=aws_elasticache_cluster.redis

# 2. Or restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier katechat-staging-db-restored \
  --db-snapshot-identifier katechat-pre-optimization-YYYYMMDD-HHMM

# 3. Update terraform.tfvars to previous values
db_instance_class = "db.t3.micro"
redis_node_type = "cache.t2.micro"
app_desired_count = 2

terraform apply
```

## Monitoring After Migration

Monitor these metrics for 7 days post-migration:

1. **Application Performance**
   - Response times should remain similar
   - Error rates should not increase

2. **Database Performance**
   - CPU utilization (should be <70%)
   - Connection count
   - Query performance

3. **Redis Performance**
   - Cache hit rate
   - Evictions (should be minimal)

4. **Cost Tracking**
   - Use AWS Cost Explorer
   - Set up billing alerts at $100/month

## Notes

- All changes preserve data integrity
- ARM-based instances (Graviton2) provide better price/performance
- CloudWatch log retention can be restored if needed
- ECR images can be manually tagged as "keep" if specific versions needed

## Support

If you encounter issues:
1. Check CloudWatch logs: `/ecs/katechat-staging-app`
2. Review RDS events in AWS Console
3. Check ECS service events
4. Restore from snapshot if critical issues

---
**Last Updated:** November 9, 2025  
**Applied By:** Terraform automated deployment
