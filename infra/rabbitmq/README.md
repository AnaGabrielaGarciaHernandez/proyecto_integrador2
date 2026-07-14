# RabbitMQ

Los servicios declaran el exchange `ecobazar.events`, el Dead Letter Exchange
`ecobazar.dlx`, sus colas y sus DLQ directamente con `amqplib` al iniciar. No se
requiere un archivo de definiciones ni plugins adicionales.

La topología y la política de cinco reintentos viven en
`packages/platform/src/events.js` para mantener una sola implementación pequeña.
