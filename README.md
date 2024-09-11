## AWS Lambda Video to HLS Converter

This is a lamda function which can use for convert s3 bucket video file into HLS format when someone upload the files in to target S3 bucket.

### Setup For Configer:

1. Create a two S3 Bucket on your AWS Account.

2. Create I AM Role for Access the S3 bucket Resources.

3. Create Lambda Function with Node.js runtime.

4. Copy this source code as a lambda function. you can create zip file of this code and upload to AWS Lambda.

5. Add Layer for your Lambda function and give the ffmpeg.zip file.

6. Add the new trigger for Lambda function and select one of erliear created S3 bucket as a target.

7. Add folowing variable as Lambda funcion enviremont variable.

````
   OUPUT_BUCKET_NAME: "output s3 bucket name"
   REGION: "both s3 bucket aws region"
````
