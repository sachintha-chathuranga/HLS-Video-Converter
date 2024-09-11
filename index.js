const path = require("path");
const fs = require("fs");
const {
	downloadFileFromS3,
	convertToHLS,
	generateMasterPlayList,
	uploadHLSToS3,
	generateResolutions,
} = require("./service");

const SUPPORTED_FORMATS = {
	mp4: true,
	mov: true,
	avi: true,
	wmv: true,
	mpg: true,
	mpeg: true,
	flv: true,
	webm: true,
	mov: true,
	mkv: true,
};

// Convert video stream to HLS using ffmpeg

exports.handler = async (event, context) => {
	console.log("Start");
	const record = event.Records[0].s3;
	const bucket = record.bucket.name;
	const outputBucket = process.env.OUPUT_BUCKET_NAME;
	const key = decodeURIComponent(record.object.key.replace(/\+/g, " "));
	const ext = path.extname(key).slice(1);
	const fileName = path.parse(key).name;
	const folderName = fileName + "_" + Date.now();
	const temporyFolder = "/tmp";
	const downloadPath = path.join(temporyFolder, `${fileName}.${ext}`);

	if (!SUPPORTED_FORMATS[ext]) {
		console.log(`ERROR: Unsupported file type (${ext})`);
		return;
	}

	try {
		// 1. Generate temporary directory for HLS files
		const outputDir = path.join(temporyFolder, folderName);
		fs.mkdirSync(outputDir, { recursive: true });
		console.log("temporary directory: " + outputDir);

		// 2. Download video from S3 bucket
		await downloadFileFromS3(bucket, key, downloadPath);
		console.log("Download Completed!");

		// 3. Generate compatible resolution list
		const resolutions = await generateResolutions(downloadPath);

		// 4. Convert video to HLS format using ffmpeg
		await convertToHLS(downloadPath, outputDir, fileName, ext, resolutions);
		console.log("convert Complated!");

		// 5. Generate Master HLS file
		generateMasterPlayList(outputDir, fileName, resolutions);

		// 6. Upload generated HLS files to S3 bucket
		await uploadHLSToS3(outputBucket, outputDir, key, folderName);

		// 7. Clear the tempory folder
		fs.rmdirSync(outputDir, { recursive: true });
		console.log("end");
	} catch (error) {
		console.log("End With Error: " + error.message);
	}
};
