output "vm_public_ip" {
  value       = yandex_compute_instance.app.network_interface[0].nat_ip_address
  description = "Public IPv4 address of the Compute Cloud VM."
}

output "postgresql_fqdn" {
  value       = try(yandex_mdb_postgresql_cluster.this.host[0].fqdn, null)
  description = "Managed PostgreSQL host FQDN."
}

output "dns_zone_name_servers" {
  value       = ["ns1.yandexcloud.net.", "ns2.yandexcloud.net."]
  description = "Authoritative name servers to configure at the external domain registrar for a public Cloud DNS zone."
}

output "yc_registry_id" {
  value       = var.yc_registry_id
  description = "External registry ID used by deployment scripts."
}
