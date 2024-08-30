// adapted from https://github.com/xenova/transformers.js/blob/main/examples/semantic-image-search-client/src/app/worker.js
// Apache 2.0 https://github.com/xenova/transformers.js/blob/main/LICENSE
// Author: Xenova (https://github.com/xenova/)

import { env, AutoTokenizer, AutoProcessor, CLIPTextModelWithProjection, CLIPVisionModelWithProjection, RawImage} from './scripts/transformers.min.js';

const EMBED_DIM = 512;
env.allowLocalModels = false;

class ApplicationSingleton {
    static model_id = 'Xenova/clip-vit-base-patch16';
    static BASE_URL = 'https://huggingface.co/datasets/Xenova/semantic-image-search-assets/resolve/main/';

    static tokenizer = null;
    static text_model = null;
    static image_model = null;
    static processor = null;

    static async getInstance(progress_callback = null) {
        // Load text tokenizer
        if (this.tokenizer === null) {
            this.tokenizer = AutoTokenizer.from_pretrained(this.model_id, { progress_callback, device: "webgpu" });
        }

        // Load image processor
        if (this.processor === null) {
            this.processor = AutoProcessor.from_pretrained(this.model_id, { progress_callback, device: "webgpu" });
        }

        if (this.text_model === null) {
            this.text_model = CLIPTextModelWithProjection.from_pretrained(this.model_id, { progress_callback, device: "webgpu" });
        }

        if (this.image_model === null) {
            this.image_model = CLIPVisionModelWithProjection.from_pretrained(this.model_id, { progress_callback, device: "webgpu" });
        }

        return Promise.all([this.tokenizer, this.text_model, this.image_model, this.processor]);
    }
}

self.addEventListener('message', async (event) => {
    const { type, images } = event.data;

    // Get the tokenizer, models, and processor. When called for the first time,
    // this will load the files and cache them for future use.
    const [tokenizer, text_model, image_model, processor] = await ApplicationSingleton.getInstance(self.postMessage);

    if (type === 'text') {
        // Send the output back to the main thread
        self.postMessage({ status: 'ready' });

        // Run tokenization
        const text_inputs = tokenizer(data.text, { padding: true, truncation: true });

        // Compute embeddings
        const { text_embeds } = await text_model(text_inputs);
        // Send the output back to the main thread
        self.postMessage({
            status: 'complete',
            output: JSON.stringify(text_embeds),
        });
    } else if (type === 'image') {
        // Send the output back to the main thread
        self.postMessage({ status: 'ready' });

        // Process the image data
        const rawimages = await Promise.all(images.map(image => RawImage.read(image)));
        const image_inputs = await processor(rawimages);

        // Compute embeddings
        const { image_embeds } = await image_model(image_inputs);

        // Send the output back to the main thread
        self.postMessage({
            status: 'complete',
            output: JSON.stringify(image_embeds),
        });
    }
});
