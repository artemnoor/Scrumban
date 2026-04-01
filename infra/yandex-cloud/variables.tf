variable "cloud_id" {
  type        = string
  description = "Yandex Cloud ID."
}

variable "folder_id" {
  type        = string
  description = "Yandex Cloud folder ID."
}

variable "zone" {
  type        = string
  description = "Primary availability zone for the app VM and PostgreSQL host."
  default     = "ru-central1-a"
}

variable "project_name" {
  type        = string
  description = "Base name used for resource naming."
  default     = "scrumbun"
}

variable "subnet_cidr" {
  type        = string
  description = "IPv4 CIDR block for the application subnet."
  default     = "10.10.0.0/24"
}

variable "app_domain" {
  type        = string
  description = "Public app domain, for example app.example.com."
}

variable "dns_zone" {
  type        = string
  description = "DNS zone with trailing dot, for example example.com."
}

variable "deploy_user" {
  type        = string
  description = "Linux user used for SSH and app deployment."
  default     = "ubuntu"
}

variable "ssh_public_key" {
  type        = string
  description = "SSH public key injected into the VM through cloud-init."
}

variable "vm_cores" {
  type        = number
  default     = 2
}

variable "vm_memory_gb" {
  type        = number
  default     = 4
}

variable "vm_disk_size_gb" {
  type        = number
  default     = 30
}

variable "vm_image_family" {
  type        = string
  default     = "ubuntu-2404-lts"
}

variable "web_public_port" {
  type        = number
  default     = 8080
}

variable "postgresql_database_name" {
  type        = string
  default     = "scrumbun"
}

variable "postgresql_username" {
  type        = string
  default     = "scrumbun"
}

variable "postgresql_password" {
  type        = string
  sensitive   = true
}

variable "postgresql_resource_preset_id" {
  type        = string
  default     = "s2.micro"
}

variable "postgresql_disk_size_gb" {
  type        = number
  default     = 20
}

variable "yc_registry_id" {
  type        = string
  description = "Existing Cloud Registry / Docker registry ID used by deployment scripts."
  default     = ""
}
