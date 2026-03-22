variable "REGISTRY" {
  default = "ghcr.io"
}

variable "REPO" {
  default = ""
}

variable "TAG" {
  default = "latest"
}

variable "SHA_TAG" {
  default = ""
}

variable "BUILD_DATE" {
  default = ""
}

group "default" {
  targets = ["event-service", "user-service", "booking-service", "payment-service", "nginx-gateway"]
}

target "services" {
  name = "${service}"
  
  matrix = {
    service = ["event-service", "user-service", "booking-service", "payment-service"]
  }
  
  context    = "./${service}"
  dockerfile = "Dockerfile"
  
  tags = compact([
    "${REGISTRY}/${REPO}/${service}:${TAG}",
    SHA_TAG != "" ? "${REGISTRY}/${REPO}/${service}:${SHA_TAG}" : "",
  ])

  # NEW: Add OCI standard metadata labels dynamically
  labels = {
    "org.opencontainers.image.title"       = "${service}"
    "org.opencontainers.image.description" = "Docker image for ${service}"
    "org.opencontainers.image.source"      = "https://github.com/${REPO}"
    "org.opencontainers.image.revision"    = "${SHA_TAG}"
    "org.opencontainers.image.created"     = "${BUILD_DATE}"
    "org.opencontainers.image.version"     = "${TAG}"
  }
}

target "nginx-gateway" {
  context    = "./nginx"
  dockerfile = "Dockerfile"

  tags = compact([
    "${REGISTRY}/${REPO}/nginx-gateway:${TAG}",
    SHA_TAG != "" ? "${REGISTRY}/${REPO}/nginx-gateway:${SHA_TAG}" : "",
  ])

  labels = {
    "org.opencontainers.image.title"       = "nginx-gateway"
    "org.opencontainers.image.description" = "Docker image for nginx-gateway"
    "org.opencontainers.image.source"      = "https://github.com/${REPO}"
    "org.opencontainers.image.revision"    = "${SHA_TAG}"
    "org.opencontainers.image.created"     = "${BUILD_DATE}"
    "org.opencontainers.image.version"     = "${TAG}"
  }
}
