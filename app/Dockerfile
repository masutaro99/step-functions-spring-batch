FROM public.ecr.aws/amazoncorretto/amazoncorretto:17
COPY ./build/libs/demo-0.0.1-SNAPSHOT.jar app.jar
ENTRYPOINT ["java","-jar","/app.jar"]