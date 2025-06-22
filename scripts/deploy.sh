#!/bin/bash

# KateChat AWS Deployment Script
# This script helps deploy the KateChat application to AWS using Terraform and GitHub Actions

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
ENVIRONMENT="staging"
AWS_REGION="us-east-1"
PROJECT_NAME="katechat"

# Function to print colored output
print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Function to check if required tools are installed
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    local missing_tools=()
    
    if ! command -v aws &> /dev/null; then
        missing_tools+=("aws-cli")
    fi
    
    if ! command -v terraform &> /dev/null; then
        missing_tools+=("terraform")
    fi
    
    if ! command -v jq &> /dev/null; then
        missing_tools+=("jq")
    fi
    
    if ! command -v docker &> /dev/null; then
        missing_tools+=("docker")
    fi
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        print_error "Missing required tools: ${missing_tools[*]}"
        print_status "Please install the missing tools and try again."
        exit 1
    fi
    
    print_success "All prerequisites are installed."
}

# Function to setup Terraform backend
setup_terraform_backend() {
    local env=$1
    local bucket_name="${PROJECT_NAME}-terraform-state-${env}"
    
    print_status "Setting up Terraform backend for ${env}..."
    
    # Check if bucket exists
    if aws s3api head-bucket --bucket "$bucket_name" 2>/dev/null; then
        print_success "S3 bucket $bucket_name already exists."
    else
        print_status "Creating S3 bucket $bucket_name..."
        aws s3 mb "s3://$bucket_name" --region "$AWS_REGION"
        
        # Enable versioning
        aws s3api put-bucket-versioning \
            --bucket "$bucket_name" \
            --versioning-configuration Status=Enabled
        
        # Enable encryption
        aws s3api put-bucket-encryption \
            --bucket "$bucket_name" \
            --server-side-encryption-configuration \
            '{"Rules":[{"ApplyServerSideEncryptionByDefault":{"SSEAlgorithm":"AES256"}}]}'
        
        print_success "S3 bucket $bucket_name created and configured."
    fi
}

# Function to create ECR repositories
create_ecr_repositories() {
    print_status "Creating ECR repositories..."
    
    local repositories=("${PROJECT_NAME}-backend" "${PROJECT_NAME}-backend-rust" "${PROJECT_NAME}-frontend")
    
    for repo in "${repositories[@]}"; do
        if aws ecr describe-repositories --repository-names "$repo" --region "$AWS_REGION" &> /dev/null; then
            print_success "ECR repository $repo already exists."
        else
            print_status "Creating ECR repository $repo..."
            aws ecr create-repository \
                --repository-name "$repo" \
                --region "$AWS_REGION" \
                --image-scanning-configuration scanOnPush=true
            print_success "ECR repository $repo created."
        fi
    done
}

# Function to display deployment information
display_deployment_info() {
    local env=$1
    
    print_status "Getting deployment information for ${env}..."
    
    cd infrastructure
    
    if [ -f terraform.tfstate ]; then
        local alb_dns=$(terraform output -raw alb_dns_name 2>/dev/null || echo "Not available")
        local ecr_urls=$(terraform output -json ecr_repository_urls 2>/dev/null || echo "{}")
        
        echo
        print_success "=== Deployment Information ==="
        echo "Environment: $env"
        echo "Load Balancer DNS: $alb_dns"
        echo "Application URL: http://$alb_dns"
        echo
        echo "ECR Repository URLs:"
        echo "$ecr_urls" | jq -r 'to_entries[] | "  \(.key): \(.value)"' 2>/dev/null || echo "  Not available"
        echo
    else
        print_warning "No Terraform state found. Run deployment first."
    fi
    
    cd ..
}

# Function to show usage
show_usage() {
    echo "Usage: $0 [COMMAND] [OPTIONS]"
    echo
    echo "Commands:"
    echo "  setup-backend     Setup Terraform backend S3 bucket"
    echo "  create-ecr        Create ECR repositories"
    echo "  plan              Run Terraform plan"
    echo "  deploy            Deploy infrastructure"
    echo "  destroy           Destroy infrastructure"
    echo "  info              Display deployment information"
    echo "  help              Show this help message"
    echo
    echo "Options:"
    echo "  -e, --environment Environment (staging|production) [default: staging]"
    echo "  -r, --region      AWS region [default: us-east-1]"
    echo "  -p, --project     Project name [default: katechat]"
    echo
    echo "Examples:"
    echo "  $0 setup-backend -e staging"
    echo "  $0 deploy -e production -r us-west-2"
    echo "  $0 info -e staging"
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -e|--environment)
            ENVIRONMENT="$2"
            shift 2
            ;;
        -r|--region)
            AWS_REGION="$2"
            shift 2
            ;;
        -p|--project)
            PROJECT_NAME="$2"
            shift 2
            ;;
        setup-backend|create-ecr|plan|deploy|destroy|info|help)
            COMMAND="$1"
            shift
            ;;
        *)
            print_error "Unknown option: $1"
            show_usage
            exit 1
            ;;
    esac
done

# Validate environment
if [[ "$ENVIRONMENT" != "staging" && "$ENVIRONMENT" != "production" ]]; then
    print_error "Environment must be either 'staging' or 'production'"
    exit 1
fi

# Main execution
case "${COMMAND:-help}" in
    setup-backend)
        check_prerequisites
        setup_terraform_backend "$ENVIRONMENT"
        ;;
    create-ecr)
        check_prerequisites
        create_ecr_repositories
        ;;
    plan)
        check_prerequisites
        cd infrastructure
        terraform init \
            -backend-config="bucket=${PROJECT_NAME}-terraform-state-${ENVIRONMENT}" \
            -backend-config="key=terraform.tfstate" \
            -backend-config="region=${AWS_REGION}"
        terraform plan \
            -var="environment=${ENVIRONMENT}" \
            -var="aws_region=${AWS_REGION}" \
            -var="project_name=${PROJECT_NAME}"
        cd ..
        ;;
    deploy)
        check_prerequisites
        cd infrastructure
        terraform init \
            -backend-config="bucket=${PROJECT_NAME}-terraform-state-${ENVIRONMENT}" \
            -backend-config="key=terraform.tfstate" \
            -backend-config="region=${AWS_REGION}"
        terraform apply \
            -var="environment=${ENVIRONMENT}" \
            -var="aws_region=${AWS_REGION}" \
            -var="project_name=${PROJECT_NAME}" \
            -auto-approve
        cd ..
        display_deployment_info "$ENVIRONMENT"
        ;;
    destroy)
        print_warning "This will destroy all infrastructure for ${ENVIRONMENT}!"
        read -p "Are you sure? (yes/no): " confirmation
        if [[ "$confirmation" == "yes" ]]; then
            cd infrastructure
            terraform destroy \
                -var="environment=${ENVIRONMENT}" \
                -var="aws_region=${AWS_REGION}" \
                -var="project_name=${PROJECT_NAME}" \
                -auto-approve
            cd ..
        else
            print_status "Destruction cancelled."
        fi
        ;;
    info)
        display_deployment_info "$ENVIRONMENT"
        ;;
    help|*)
        show_usage
        ;;
esac
