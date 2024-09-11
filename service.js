const ffmpeg = require("fluent-ffmpeg");
const {
	S3Client,
	GetObjectCommand,
	PutObjectCommand,
} = require("@aws-sdk/client-s3");
const fs = require("fs");
const path = require("path");
const { pipeline } = require("stream");
const { promisify } = require("util");

const s3Client = new S3Client({
	region: process.env.REGION,
});
// ffmpeg.setFfmpegPath("/usr/bin/ffmpeg"); // Path where FFmpeg is in system
// ffmpeg.setFfprobePath("/usr/bin/ffprobe");
ffmpeg.setFfmpegPath("/opt/ffmpeg_lib/ffmpeg"); // Path where FFmpeg is in the layer
ffmpeg.setFfprobePath("/opt/ffmpeg_lib/ffprobe");

// Download video file from S3
const downloadFileFromS3 = async (bucket, key, downloadPath) => {
	const command = new GetObjectCommand({ Bucket: bucket, Key: key });
	const response = await s3Client.send(command);
	// Stream the file to the local file system
	const streamPipeline = promisify(pipeline);
	await streamPipeline(response.Body, fs.createWriteStream(downloadPath));
	return downloadPath;
};

// Convert given video to HLS
const convertToHLS = async (
	videoStream,
	outputDir,
	fileName,
	ext,
	filterdResolutions
) => {
	const promises = filterdResolutions.map(
		({ resolution, size, bitrate }, index) => {
			return new Promise((resolve, reject) => {
				const outputFileName = `${fileName}_${resolution}.m3u8`;
				const outputFilePath = path.join(outputDir, outputFileName);
				console.log(outputFilePath);

				ffmpeg(videoStream)
					.inputFormat(ext) // Set the input format (e.g., 'mp4')
					.outputOptions([
						`-b:v ${bitrate}`,
						"-preset veryfast",
						"-g 48",
						"-sc_threshold 0",
						"-map 0:0",
						"-map 0:1?",
						"-c:v libx264",
						"-c:a aac",
						"-hls_time 4",
						"-hls_playlist_type vod",
						"-f hls",
					])
					.size(size)
					.aspect("16:9")
					.autopad()
					.output(outputFilePath)
					// .screenshots({
					// 	// timestamps: [30.5, "50%", "01:10.123"],
					// 	count: 4,
					// 	filename: "thumbnail-at-%s-seconds.png",
					// 	folder: outputDir,
					// 	size: "1280x720",
					// })
					.on("end", () => {
						console.log(index + 1 + " Conversion finished successfully.");
						resolve();
					})
					.on("error", (err) => {
						console.error(
							index + 1 + " Error during conversion:",
							err.message
						);
						reject(err);
					})
					.run();
			});
		}
	);
	console.log("waiting....");
	return await Promise.all(promises);
};

// Generate master playlist
const generateMasterPlayList = (outputDir, fileName, filterdResolutions) => {
	// Generate the master playlist Content
	const masterPlaylistContent = filterdResolutions
		.map(({ resolution, width, bitrate }) => {
			return `#EXT-X-STREAM-INF:BANDWIDTH=${
				parseInt(bitrate) * 1000
			},RESOLUTION=${width}x${resolution},NAME="${resolution}"\n${fileName}_${resolution}.m3u8`;
		})
		.join("\n");

	const masterPlaylistPath = path.join(outputDir, `${fileName}.m3u8`);

	// write main file content in to local folder
	console.log("Start Writing main file...");
	fs.writeFileSync(
		masterPlaylistPath,
		`#EXTM3U\n#EXT-X-VERSION:3\n${masterPlaylistContent}`
	);
	console.log("Main file writen succsusfully!");
};

// Upload video file to S3
const uploadHLSToS3 = async (bucket, dir, originalVideoKey, folderName) => {
	const files = fs.readdirSync(dir);
	console.log("Uploading...")
	for (const file of files) {
		const filePath = path.join(dir, file);

		const fileStream = fs.createReadStream(filePath);

		const hlsKey = path.join(
			path.dirname(originalVideoKey),
			folderName,
			file
		); // Upload files to 'hls/' directory in S3
		const uploadCommand = new PutObjectCommand({
			Bucket: bucket,
			Key: hlsKey,
			Body: fileStream,
			ContentType: file.endsWith(".m3u8")
				? "application/x-mpegURL"
				: "video/MP2T",
		});

		await s3Client.send(uploadCommand);
		console.log(`Uploaded: ${hlsKey}`);
	}
	console.log("All file Uploaded Successfully!");
};

// Function to get video metadata
const getVideoInfo = (filePath) => {
	return new Promise((resolve, reject) => {
		ffmpeg.ffprobe(filePath, (err, metadata) => {
			if (err) {
				reject(err);
			} else {
				const videoStream = metadata.streams.find(
					(stream) => stream.codec_type === "video"
				);
				if (videoStream) {
					const resolution = {
						width: videoStream.width,
						height: videoStream.height,
						codec: videoStream.codec_name,
						bitrate: videoStream.bit_rate,
					};
					resolve(resolution);
				} else {
					reject("No video stream found");
				}
			}
		});
	});
};

const generateResolutions = async (filePath) => {
	const videoInfo = await getVideoInfo(filePath);
	const resolutions = [
		{
			resolution: "140p",
			size: "?x140",
			width: "248",
			bitrate: "150k",
		},
		{
			resolution: "240p",
			size: "?x240",
			width: "426",
			bitrate: "500k",
		},
		{
			resolution: "360p",
			size: "?x360",
			width: "640",
			bitrate: "1000k",
		},
		{
			resolution: "480p",
			size: "?x480",
			width: "854",
			bitrate: "1500k",
		},
		{
			resolution: "720p",
			size: "?x720",
			width: "1280",
			bitrate: "4000k",
		},
		{
			resolution: "1080p",
			size: "?x1080",
			width: "1920",
			bitrate: "6000k",
		},
	];

	// Filter target resolutions smaller than original
	return resolutions.filter(
		(res) =>
			parseInt(res.width) <= videoInfo.width &&
			parseInt(res.resolution.replace(/p$/, "")) <= videoInfo.height
	);
};

module.exports = {
	downloadFileFromS3,
	convertToHLS,
	uploadHLSToS3,
	generateMasterPlayList,
	generateResolutions,
};
