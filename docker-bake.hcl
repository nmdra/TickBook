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

group "default" {
  targets = ["event-service", "user-service", "booking-service", "payment-service"]
}

target "event-service" {
  context    = "./event-service"
  dockerfile = "Dockerfile"
  tags = compact([
    "${REGISTRY}/${REPO}/event-service:${TAG}",
    SHA_TAG != "" ? "${REGISTRY}/${REPO}/event-service:${SHA_TAG}" : "",
  ])
}

target "user-service" {
  context    = "./user-service"
  dockerfile = "Dockerfile"
  tags = compact([
    "${REGISTRY}/${REPO}/user-service:${TAG}",
    SHA_TAG != "" ? "${REGISTRY}/${REPO}/user-service:${SHA_TAG}" : "",
  ])
}

target "booking-service" {
  context    = "./booking-service"
  dockerfile = "Dockerfile"
  tags = compact([
    "${REGISTRY}/${REPO}/booking-service:${TAG}",
    SHA_TAG != "" ? "${REGISTRY}/${REPO}/booking-service:${SHA_TAG}" : "",
  ])
}

target "payment-service" {
  context    = "./payment-service"
  dockerfile = "Dockerfile"
  tags = compact([
    "${REGISTRY}/${REPO}/payment-service:${TAG}",
    SHA_TAG != "" ? "${REGISTRY}/${REPO}/payment-service:${SHA_TAG}" : "",
  ])
}
