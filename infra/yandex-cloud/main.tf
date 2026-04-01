data "yandex_compute_image" "ubuntu" {
  family = var.vm_image_family
}

resource "yandex_vpc_network" "this" {
  name = "${var.project_name}-network"
}

resource "yandex_vpc_subnet" "this" {
  name           = "${var.project_name}-subnet"
  zone           = var.zone
  network_id     = yandex_vpc_network.this.id
  v4_cidr_blocks = [var.subnet_cidr]
}

resource "yandex_vpc_security_group" "vm" {
  name       = "${var.project_name}-vm-sg"
  network_id = yandex_vpc_network.this.id

  ingress {
    protocol       = "TCP"
    description    = "HTTP"
    port           = 80
    v4_cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    protocol       = "TCP"
    description    = "HTTPS"
    port           = 443
    v4_cidr_blocks = ["0.0.0.0/0"]
  }

  ingress {
    protocol       = "TCP"
    description    = "SSH"
    port           = 22
    v4_cidr_blocks = ["0.0.0.0/0"]
  }

  egress {
    protocol       = "ANY"
    description    = "Allow outbound traffic"
    from_port      = 0
    to_port        = 65535
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "yandex_vpc_security_group" "postgresql" {
  name       = "${var.project_name}-postgresql-sg"
  network_id = yandex_vpc_network.this.id

  ingress {
    protocol       = "TCP"
    description    = "Managed PostgreSQL from app subnet"
    port           = 6432
    v4_cidr_blocks = [var.subnet_cidr]
  }

  egress {
    protocol       = "ANY"
    description    = "Allow outbound traffic"
    from_port      = 0
    to_port        = 65535
    v4_cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "yandex_mdb_postgresql_cluster" "this" {
  name               = "${var.project_name}-postgresql"
  environment        = "PRODUCTION"
  network_id         = yandex_vpc_network.this.id
  security_group_ids = [yandex_vpc_security_group.postgresql.id]

  config {
    version = 16

    resources {
      resource_preset_id = var.postgresql_resource_preset_id
      disk_type_id       = "network-ssd"
      disk_size          = var.postgresql_disk_size_gb
    }
  }

  host {
    zone             = var.zone
    subnet_id        = yandex_vpc_subnet.this.id
    assign_public_ip = false
  }
}

resource "yandex_mdb_postgresql_database" "this" {
  cluster_id = yandex_mdb_postgresql_cluster.this.id
  name       = var.postgresql_database_name
  owner      = var.postgresql_username
  depends_on = [yandex_mdb_postgresql_user.this]
}

resource "yandex_mdb_postgresql_user" "this" {
  cluster_id = yandex_mdb_postgresql_cluster.this.id
  name       = var.postgresql_username
  password   = var.postgresql_password
}

resource "yandex_compute_instance" "app" {
  name = "${var.project_name}-app"
  zone = var.zone

  resources {
    cores         = var.vm_cores
    memory        = var.vm_memory_gb
    core_fraction = 100
  }

  boot_disk {
    initialize_params {
      image_id = data.yandex_compute_image.ubuntu.id
      type     = "network-ssd"
      size     = var.vm_disk_size_gb
    }
  }

  network_interface {
    subnet_id          = yandex_vpc_subnet.this.id
    nat                = true
    security_group_ids = [yandex_vpc_security_group.vm.id]
  }

  metadata = {
    user-data = templatefile("${path.module}/cloud-init.yaml", {
      deploy_user     = var.deploy_user
      ssh_public_key  = var.ssh_public_key
      web_public_port = var.web_public_port
    })
    ssh-keys = "${var.deploy_user}:${var.ssh_public_key}"
  }
}

// DNS is temporarily managed outside Terraform while the public zone
// for proc-sima.online is occupied elsewhere in Yandex Cloud.
