const fs = require('fs');
const path = require('path');
const md5 = require('md5');
const cliProgress = require('cli-progress');
const { exiftool } = require('exiftool-vendored');

async function loadImagesFromDirectory(directory) {
    const files = fs.readdirSync(directory);
    const images = [];

    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(files.length, 0);
    
    for (let i = 0; i < files.length; i++) {
        const filePath = path.join(directory, files[i]);
        const { RawImage } = await import('@xenova/transformers');
        const image = await RawImage.read(filePath);
        const imageBuffer = fs.readFileSync(filePath);
        images.push({ path: filePath, buffer: imageBuffer, image });
        progressBar.update(i + 1);
    }
    
    progressBar.stop();

    return images;
}

async function computeEmbeddings(images) {
    const { AutoProcessor, CLIPVisionModelWithProjection } = await import('@xenova/transformers');
    const processor = await AutoProcessor.from_pretrained('Xenova/clip-vit-base-patch16', {device: "webgpu"});
    const model = await CLIPVisionModelWithProjection.from_pretrained('Xenova/clip-vit-base-patch16', {device: "webgpu"});

    const embeddings = [];
    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(images.length, 0);

    for (let i = 0; i < images.length; i++) {
        const { path, buffer, image } = images[i];
        const imageInputs = await processor(image);
        const output = await model(imageInputs);
        const embedding = output.image_embeds.data;

        embeddings.push({
            path,
            md5: md5(buffer),
            embedding: Array.from(embedding)
        });

        // Write embedding to EXIF metadata
        await exiftool.write(path, {
            'UserComment': JSON.stringify({ md5: md5(buffer), embedding: Array.from(embedding) })
        });

        progressBar.update(i + 1);
    }

    progressBar.stop();
    return embeddings;
}

async function saveEmbeddingsToFile(embeddings, outputFile) {
    fs.writeFileSync(outputFile, JSON.stringify(embeddings, null, 2));
}

async function main(directory, outputFile) {
    const images = await loadImagesFromDirectory(directory);
    const embeddings = await computeEmbeddings(images);
    await saveEmbeddingsToFile(embeddings, outputFile);
    console.log(`Embeddings saved to ${outputFile}`);
}

main('/mnt/c/Users/rjbc76/rjbc76-Work-Sync/Projects/bumper/images', '/mnt/c/Users/rjbc76/rjbc76-Work-Sync/Projects/bumper/images/embeddings.json');