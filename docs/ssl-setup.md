# SSL Certificate Setup Guide

Since your HTTPS isn't working, you need to set up an SSL certificate. Here are your options:

## Option 1: Use AWS Certificate Manager (Recommended)

### For a custom domain:
1. First, you need a domain name (like `katechat.app`)
2. Request a certificate in AWS Certificate Manager
3. Validate domain ownership
4. Update Terraform with the certificate ARN

### Steps:
```bash
# 1. Request certificate (replace with your domain)
aws acm request-certificate \
  --domain-name "yourdomain.com" \
  --subject-alternative-names "*.yourdomain.com" \
  --validation-method DNS \
  --region eu-central-1

# 2. Get certificate ARN from output and add to terraform.tfvars
echo 'certificate_arn = "arn:aws:acm:eu-central-1:508414931829:certificate/your-cert-id"' >> terraform.tfvars

# 3. Apply terraform
terraform apply
```

## Option 2: Use CloudFlare or other CDN

You can put CloudFlare in front of your ALB:
- CloudFlare provides free SSL certificates
- Set CloudFlare SSL mode to "Flexible" 
- CloudFlare terminates SSL, talks to ALB over HTTP

## Option 3: Self-signed certificate (Development only)

For development/testing, you can create a self-signed certificate:

```bash
# This is NOT recommended for production
aws acm import-certificate \
  --certificate fileb://cert.pem \
  --private-key fileb://private-key.pem \
  --region eu-central-1
```

## Current Issue

Your load balancer currently only has:
- HTTP listener on port 80 ✅ 
- No HTTPS listener on port 443 ❌

The HTTPS listener is only created when `certificate_arn` is provided in your Terraform variables.
