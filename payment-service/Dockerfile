FROM maven:3.9-eclipse-temurin-21-alpine AS builder
WORKDIR /app
COPY pom.xml .
RUN mvn dependency:go-offline -B -ntp \
	-Dmaven.wagon.http.retryHandler.count=6 \
	-Dmaven.wagon.http.retryHandler.requestSentEnabled=true \
	-Dmaven.wagon.http.pool=false
COPY src ./src
RUN mvn package -DskipTests -B -ntp \
	-Dmaven.wagon.http.retryHandler.count=6 \
	-Dmaven.wagon.http.retryHandler.requestSentEnabled=true \
	-Dmaven.wagon.http.pool=false

FROM eclipse-temurin:21-jre-alpine
WORKDIR /app
RUN addgroup -g 1001 appgroup && adduser -u 1001 -G appgroup -s /bin/sh -D appuser
COPY --from=builder /app/target/*.jar app.jar
ENV JAVA_OPTS=""
USER appuser
EXPOSE 3004
ENTRYPOINT ["sh", "-c", "java $JAVA_OPTS -jar app.jar"]
