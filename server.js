const express = require("express");
const ffmpeg = require("fluent-ffmpeg");
const ffmpegInstaller = require("@ffmpeg-installer/ffmpeg");
const upload = require("express-fileupload");
const hls = require("hls-server");
const fs = require("fs");
const app = express();

app.use(upload());
app.use("/css", express.static(__dirname + "/css"));
app.use("/js", express.static(__dirname + "/js"));
app.use("/outputs", express.static(__dirname + "/outputs"));
app.use(
  "/assets/previewImgs",
  express.static(__dirname + "/assets/previewImgs")
);

//* ffmpegInstaller is resolver of the error that occur when you only use ffmpeg.
ffmpeg.setFfmpegPath(ffmpegInstaller.path);

app.get("/", (req, res) => {
  res.sendFile(__dirname + "/index.html");
});

app.post("/", (req, res) => {
  let outputCodec, outputQuality;

  if (req.files) {
    const file = req.files.file;
    const uploadedFilePath = "./uploads/" + file.name;

    file.mv(uploadedFilePath, (err) => {
      if (err) {
        return res.send(err);
      }

      //* Reading video metadata
      ffmpeg.ffprobe(uploadedFilePath, (err, metadata) => {
        if (err) {
          console.log("Error while reading video metadata", err);
        }

        switch (req.body.codec) {
          case "h264":
          case "default":
            outputCodec = "libx264";
            break;
          case "h265":
            outputCodec = "libx265";
            break;
          case "vp9":
            outputCodec = "libvpx-vp9";
            break;
        }

        // const stream = metadata.streams[0];
        // outputQuality =
        //   ~~stream.height <= ~~reqQuality || reqQuality === "default"
        //     ? stream.height
        //     : reqQuality;

        //* Transcoding video
        ffmpeg(uploadedFilePath, { timeout: 432000 })
          // .videoCodec(outputCodec)
          // .size(`?x${outputQuality}`)
          // .aspectRatio("16:9")
          // .autopad("black")
          // .noAudio()
          // .audioCodec("libmp3lame")
          // .audioBitrate(128)
          // .audioChannels(2)
          // .noVideo()
          // .fps(29.7)
          // .duration("2:14.500")
          .addOptions([
            "-map 0:0",
            "-map 0:1",
            "-map 0:0",
            "-map 0:1",
            `-c:a aac -c:v ${outputCodec}`,
            "-s:v:0 960x540",
            "-b:v:0 128k",
            "-s:v:1 640x480",
            "-b:v:1 128k",
            "-var_stream_map",
            '"v:0,a:0 v:1,a:1"',
            "-master_pl_name master.m3u8",
            "-f hls",
            "-max_muxing_queue_size 1024",
            "-hls_time 1",
            "-hls_list_size 0",
            "-hls_segment_filename",
            "v%v/fileSequence%d.ts",
            // "-start_number 0", // start the first .ts segment at index 0
            // "-hls_time 10", //Set length of segmented video in seconds.
            // "-hls_list_size 0", // Maxmimum number of playlist entries (0 means all entries/infinite)
            // "-f hls", //Set the format. Of course it should be ‘hls’.
          ])
          .on("start", (cmd) => {
            console.log("Started Transcoding...\n", cmd);
          })
          .on("progress", (progress) => {
            console.log("Processing: " + Math.round(progress.percent) + "%");
          })
          .on("end", () => {
            console.log("Done Transcoding");
            res.header("Refresh", "1");
            res.send("File processed, video preview will show up in 1s");
          })
          .on("error", (err) => {
            console.log("Error: " + err.message);
            res.send("An error occurred.");
          })
          .save("./outputs/vid_out.m3u8");
      });

      //* Generating thumbnails
      // ffmpeg(uploadedFilePath)
      //   // .on('filenames', function (filenames) {
      //   //   console.log('Will generate ' + filenames.join(', '))
      //   // })
      //   .screenshots({
      //     count: 10,
      //     folder: "./assets/previewImgs",
      //     //     timestamps: [1, 15, 30.5, '50%', '01:10.123'],
      //     filename: "thumbnail-at-%s-seconds.png",
      //     size: "320x240",
      //   })
      //   .on("end", () => {
      //     console.log("Screenshots taken");
      //   });
    });
  }
});

const server = app.listen(5000, () =>
  console.log("Server listening on port 5000")
);

new hls(server, {
  provider: {
    // A function that is ran on all requests. It check a file exists.
    // If you passed null and true to cb, It means a file exists and
    // ready to stream. But if you passed null and false to cb,
    // It means a file not exists.
    exists: (req, cb) => {
      const ext = req.url.split(".").pop();

      if (ext !== "m3u8" && ext !== "ts") {
        return cb(null, true);
      }

      fs.access(__dirname + req.url, fs.constants.F_OK, (err) => {
        if (err) {
          console.log("File not exist");
          return cb(null, false);
        }
        cb(null, true);
      });
    },
    // A function that is ran on requests for .m3u8 file.
    // Pass null and stream to cb.
    getManifestStream: (req, cb) => {
      const stream = fs.createReadStream(__dirname + req.url);
      cb(null, stream);
    },
    // A function that is ran on requests for .ts file.
    // Pass null and stream to cb.
    getSegmentStream: (req, cb) => {
      const stream = fs.createReadStream(__dirname + req.url);
      cb(null, stream);
    },
  },
});

// try {
//   var process = new ffmpeg('./uploads/' + file.name);
//   process.then((video) => {
//     // video.fnExtractSoundToMP3('./uploads/audio_file.mp3', (error, file) => {
//     //   if (!error)
//     //     console.log('Audio file converted: ' + file);
//     //   else console.log(error)
//     // });
//     video.setVideoFormat('avi').save('./uploads/your_movie.avi', (error, file) => {
//       if (!error)
//         console.log('Video file: ' + file);
//       else console.log(error)
//     });
//   }, (err) => {
//     console.log('Error: ' + err);
//   });
// } catch (e) {
//   console.log(e.code, e.msg);
// }

//* this works ?!
// infs.addInput('./uploads/' + filename).outputOptions([
//   '-map 0:0',
//   '-map 0:1',
//   '-map 0:0',
//   '-map 0:1',
//   '-s:v:0 2160x3840',
//   '-c:v:0 libx264',
//   '-b:v:0 2000k',
//   '-s:v:1 960x540',
//   '-c:v:1 libx264',
//   '-b:v:1 365k',
// '-var_stream_map', '"v:0,a:0 v:1,a:1"',
//   '-master_pl_name master.m3u8',
//   '-f hls',
//   '-max_muxing_queue_size 1024',
//   '-hls_time 1',
//   '-hls_list_size 0',
//   '-hls_segment_filename', 'v%v/fileSequence%d.ts'
// ]).output('./uploads/video.m3u8')
//   .on('start', function (commandLine) {
//     console.log('Spawned Ffmpeg with command: ' + commandLine);
//   })
//   .on('error', function (err, stdout, stderr) {
//     console.log('An error occurred: ' + err.message, err, stderr);
//   })
//   .on('progress', function (progress) {
//     console.log('Processing: ' + progress.percent + '% done')
//   })
//   .on('end', function (err, stdout, stderr) {
//     console.log('Finished processing!' /*, err, stdout, stderr*/)
//   })
//   .run()
