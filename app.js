import { computeConvexHull, hullsIntersect, getImageData, interpolateVectorsLinear, 
    findTopNClosestVectors } from './utils.js'

const NUM_INITIAL_IMAGES = 30;

const loadedImages = [];
let positions = [];

let dragging = false;
let dragIndex = -1;
let offsetX, offsetY;

let currentImageIndex = 0;
let selectedItem = null; // Global variable to store the selected item

let embeddings = null;

let temperature = 10;
const coolingRate = 1;
let currentEnergy;
let iteration = 0;
const redrawInterval = 1; // Adjust this value to control redraw frequency
let annealingDone = false;

let selectedIndex = -1;

let leftConceptEmbedding = null;
let rightConceptEmbedding = null;
let currentVectorQuery = null;

let embeddingQueries = {};

const canvas = document.getElementById('packingCanvas');
const ctx = canvas.getContext('2d');
const worker = new Worker('worker.js', { type: "module" });

worker.onmessage = (event) => {
    const { status, output } = event.data;
    if (status === 'ready') {
        console.log('Worker is ready');
    } else if (status === 'complete') {
        console.log('Embeddings:', event.data);
    }
};

function getRandomSlice(arr, n) {
    const result = [];
    const arrayCopy = [...arr];
    let len = arrayCopy.length;

    for (let i = 0; i < n; i++) {
        const randomIndex = Math.floor(Math.random() * len);
        result.push(arrayCopy[randomIndex]);
        arrayCopy[randomIndex] = arrayCopy[len - 1];
        len--;
    }

    return result;
}

function getImagePathsFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const imagePaths = urlParams.get('images');
    if (imagePaths) {
        return imagePaths.split(',');
    }

    const hash = window.location.hash.substring(1);
    if (hash) {
        return hash.split(',');
    }

    return null;
}

async function embedImages(images) {
    const base64Images = await Promise.all(images.map(image => convertToBase64(image)));
    // worker.postMessage({type: 'image', content: base64Images});
}

function runWorkerTask(worker, message) {
    return new Promise((resolve, reject) => {
        worker.onmessage = (event) => {
            if (event.data.status === 'complete') {
                resolve(event.data.output);
            }
        };
        worker.onerror = (error) => {
            reject(error);
        };
        worker.postMessage(message);
    });
}


function convertToBase64(image) {
    return new Promise((resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(image, 0, 0);
        resolve(canvas.toDataURL());
    });
}


function loadImages(imagePaths) {
    const imagePromises = imagePaths.map(src => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.src = `${src}`;
            img.onload = () => {
                loadedImages.push(img);
                resolve();
            };
            img.onerror = reject;
        });
    });

    // Wait for all images to load
    Promise.all(imagePromises).then(() => {
        packImages();
        embedImages(loadedImages);
    }).catch(error => {
        console.error('Error loading images:', error);
    });

}

// Fetch the JSON file containing the image list
function fetchImagesFromJSON() {
    fetch('image_list.json')
        .then(response => response.json())
        .then(images => {
            const imagePaths = getRandomSlice(images, NUM_INITIAL_IMAGES);
            updateURLWithImages(imagePaths);
            loadImages(imagePaths);
        })
        .catch(error => {
            console.error('Error fetching image list:', error);
        });
}

function fetchImageEmbeddingsFromJSON() {
    fetch('images/embeddings.json')
        .then(response => response.json())
        .then(data => {
            embeddings = data;
            console.log("Pre-computed image embeddings loaded!");
        })
        .catch(error => console.error('Error loading embeddings:', error));
}

function updateURLWithImages(imagePaths) {
    const url = new URL(window.location);
    url.searchParams.set('images', imagePaths.join(','));
    window.history.replaceState({}, '', url);
}

function packImages() {
    loadedImages.forEach(img => {
        const imageData = getImageData(img);
        const hull = computeConvexHull(imageData);
        positions.push({ img, x: Math.random() * (canvas.width - img.width), y: Math.random() * (canvas.height - img.height), rotation: 0, hull });
    });

    currentEnergy = calculateEnergy(positions);
    startAnnealing();
    startRendering();
}

function startAnnealing() {
    const annealingInterval = setInterval(() => {
        if (temperature <= 1) {
            clearInterval(annealingInterval);
            annealingDone = true; // Set a flag to indicate annealing is done
            return;
        }

        const newPositions = generateNeighbor(positions);
        const newEnergy = calculateEnergy(newPositions);

        if (acceptanceProbability(currentEnergy, newEnergy, temperature) > Math.random()) {
            positions = newPositions;
            currentEnergy = newEnergy;
        }

        temperature *= 1 - coolingRate;
        iteration++;
    }, 0); // Adjust the interval time as needed
}

function startRendering() {
    function renderLoop() {
        if (annealingDone) {
            renderImages(positions);
            // renderHulls(positions);
            return; // Stop the loop when annealing is done
        }

        if (iteration % redrawInterval === 0) {
            renderImages(positions);
            // renderHulls(positions);
        }
        requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);
}



function calculateEnergy(positions) {
    function offsetHull(hull, offsetX, offsetY) {
        return hull.map(point => ({
            x: point.x + offsetX,
            y: point.y + offsetY
        }));
    }

    let energy = 0;
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            if (hullsIntersect(offsetHull(positions[i].hull, positions[i].x, positions[i].y),
                offsetHull(positions[j].hull, positions[j].x, positions[j].y))) {
                energy += 1;
            }
        }
    }
    return energy;
}

function generateNeighbor(positions) {
    const newPositions = positions.map(pos => ({ ...pos }));
    const action = Math.floor(Math.random() * 3); // Randomly choose an action: 0 = jitter, 1 = swap, 2 = rotate

    if (action === 0) {
        // Jitter x, y
        const index = Math.floor(Math.random() * newPositions.length);
        const jitterAmount = 20;
        newPositions[index].x += (Math.random() - 0.5) * jitterAmount;
        newPositions[index].y += (Math.random() - 0.5) * jitterAmount;
    } else if (action === 1) {
        // Swap positions
        const index1 = Math.floor(Math.random() * newPositions.length);
        let index2 = Math.floor(Math.random() * newPositions.length);
        while (index1 === index2) {
            index2 = Math.floor(Math.random() * newPositions.length);
        }
        // Swap x and y coordinates
        const tempX = newPositions[index1].x;
        const tempY = newPositions[index1].y;
        newPositions[index1].x = newPositions[index2].x;
        newPositions[index1].y = newPositions[index2].y;
        newPositions[index2].x = tempX;
        newPositions[index2].y = tempY;
    } else if (action === 2) {
        // Random rotation
        const index = Math.floor(Math.random() * newPositions.length);
        const rotationAmount = Math.random() * 360; // Random rotation between 0 and 360 degrees
        newPositions[index].rotation = (newPositions[index].rotation || 0) + rotationAmount;
    }

    return newPositions;
}

function acceptanceProbability(currentEnergy, newEnergy, temperature) {
    if (newEnergy < currentEnergy) {
        return 1.0;
    }
    return Math.exp((currentEnergy - newEnergy) / temperature);
}

function renderImages(positions) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    positions.forEach((pos, index) => {
        ctx.save();
        ctx.translate(pos.x + pos.img.width / 2, pos.y + pos.img.height / 2);
        ctx.rotate(pos.rotation * Math.PI / 180);
        ctx.drawImage(pos.img, -pos.img.width / 2, -pos.img.height / 2);

        if (index === selectedIndex) {
            ctx.strokeStyle = 'red';
            ctx.lineWidth = 2;
            ctx.strokeRect(-pos.img.width / 2, -pos.img.height / 2, pos.img.width, pos.img.height);
        }

        ctx.restore();
    });
}

function renderHulls(positions) {
    positions.forEach(pos => {
        if (pos.hull && pos.hull.length > 0) {
            ctx.save();
            ctx.translate(pos.x + pos.img.width / 2, pos.y + pos.img.height / 2);
            ctx.rotate(pos.rotation * Math.PI / 180);
            ctx.beginPath();
            ctx.moveTo(pos.hull[0].x - pos.img.width / 2, pos.hull[0].y - pos.img.height / 2);
            for (let i = 1; i < pos.hull.length; i++) {
                ctx.lineTo(pos.hull[i].x - pos.img.width / 2, pos.hull[i].y - pos.img.height / 2);
            }
            ctx.closePath();
            ctx.strokeStyle = 'green';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.restore();
        }
    });
}

canvas.addEventListener('mousedown', (e) => {
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    let clickedOnImage = false;
    for (let i = 0; i < positions.length; i++) {
        const pos = positions[i];
        if (mouseX >= pos.x && mouseY >= pos.y && mouseX <= pos.x + pos.img.width && mouseY <= pos.y + pos.img.height) {
            dragging = true;
            dragIndex = i;
            offsetX = mouseX - pos.x;
            offsetY = mouseY - pos.y;
            clickedOnImage = true;
            selectedIndex = i;
            break;
        }
    }

    if (!clickedOnImage) {
        selectedIndex = -1;
    }

    renderImages(positions);
});

canvas.addEventListener('mousemove', (e) => {
    const mouseX = e.offsetX;
    const mouseY = e.offsetY;

    if (dragging) {
        positions[dragIndex].x = mouseX - offsetX;
        positions[dragIndex].y = mouseY - offsetY;
        renderImages(positions);
    }
});

canvas.addEventListener('mouseup', () => {
    dragging = false;
    dragIndex = -1;
});

canvas.addEventListener('mouseleave', () => {
    dragging = false;
    dragIndex = -1;
});

canvas.addEventListener('wheel', (e) => {
    if (dragging) {
        if (e.altKey) {
            currentImageIndex = (currentImageIndex + (e.deltaY > 0 ? 1 : -1) + loadedImages.length) % loadedImages.length;
            positions[dragIndex].img = loadedImages[currentImageIndex];
            updateURLWithCurrentImage();
        } else {
            positions[dragIndex].rotation += e.deltaY > 0 ? 15 : -15; // Rotate by 15 degrees
        }
        renderImages(positions);
    }
});

function updateURLWithCurrentImage() {
    const url = new URL(window.location);
    const imagePaths = loadedImages.map(img => img.src);
    url.searchParams.set('images', imagePaths.join(','));
    window.history.replaceState({}, '', url);
}

document.addEventListener('DOMContentLoaded', () => {
    const saveButton = document.getElementById('saveConceptPair');
    const leftTargetInput = document.getElementById('leftTarget');
    const rightTargetInput = document.getElementById('rightTarget');
    const dropdown = document.getElementById('dropdown');

    function checkForDuplicates() {
        const leftTarget = leftTargetInput.value;
        const rightTarget = rightTargetInput.value;
        const newPair = `${leftTarget}-${rightTarget}`;

        for (let i = 0; i < dropdown.options.length; i++) {
            if (dropdown.options[i].value === newPair) {
                saveButton.disabled = true;
                return;
            }
        }
        saveButton.disabled = false;
    }

    function updateInputs(pair) {
        const [left, right] = pair.split('-');
        leftTargetInput.value = left;
        rightTargetInput.value = right;
        saveButton.disabled = true; // Disable save button when an item is selected
    }

    leftTargetInput.addEventListener('input', checkForDuplicates);
    rightTargetInput.addEventListener('input', checkForDuplicates);

    // Save concept pair
    saveButton.addEventListener('click', () => {
        const leftTarget = leftTargetInput.value;
        const rightTarget = rightTargetInput.value;
        const newPair = `${leftTarget}-${rightTarget}`;

        const newOption = document.createElement('option');
        newOption.value = newPair;
        newOption.text = newPair;
        dropdown.add(newOption);

        // Set the new pair as the selected item
        dropdown.value = newPair;
        selectedItem = newPair;

        updateConceptPairEmbeddings(newPair).then(() => {
            console.log('Concept Pair Embeddings updated');
        });
    });

    // Save canvas
    document.getElementById('saveButton').addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = 'canvas_image.png';
        link.href = canvas.toDataURL();
        link.click();
    });

    dropdown.addEventListener('change', (e) => {
        selectedItem = e.target.value;
        updateInputs(selectedItem);
        updateConceptPairEmbeddings(selectedItem).then(() => {
            console.log('Concept Pair Embeddings updated');
        });
    });

    // Initial check for duplicates on page load
    checkForDuplicates();

    document.getElementById('refreshButton').addEventListener('click', () => {
        location.reload();
    });

    document.getElementById('homeButton').addEventListener('click', () => {
        window.location.href = '/';
    });

    document.getElementById('renderHulls').addEventListener('click', () => {
        renderHulls(positions);
    });

    document.addEventListener('click', (e) => {
        const contextMenu = document.getElementById('contextMenu');
        if (e.target !== contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
        const filter = e.target.value.toLowerCase();
        const options = dropdown.options;
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            if (option.text.toLowerCase().includes(filter)) {
                option.style.display = '';
            } else {
                option.style.display = 'none';
            }
        }
    });

    document.getElementById('slider').addEventListener('input', (e) => {
        const sliderValue = parseFloat(slider.value);
        if (rightConceptEmbedding != null && leftConceptEmbedding != null) {
             
            let cv = embeddingQueries[sliderValue];

            const loadImage = new Promise((resolve, reject) => {
                const img = new Image();
                img.src = `${cv.embedding.path}`;
                img.onload = () => {
                    positions[selectedIndex].img = img;
                    renderImages(positions);
                    resolve();
                };
                img.onerror = reject;
            });

            loadImage.then(() => {
                console.log(`Replacement image (${cv.embedding.path}) loaded successfully`);
            }).catch(error => {
                console.error('Error loading image:', error);
            });

        } else {
            currentImageIndex = Math.round(sliderValue * (loadedImages.length - 1));
            positions[selectedIndex].img = loadedImages[currentImageIndex];
            updateURLWithCurrentImage();
            renderImages(positions);
        }

    });
});

function showContextMenu(x, y) {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';
}

function roundToStep(value, step) {
    const inv = 1.0 / step;
    return Math.round(value * inv) / inv;
}

async function updateConceptPairEmbeddings(pair) {
    const slider = document.getElementById('slider');
    slider.disabled = true;

    const [left, right] = pair.split('-');

    try {
        const leftResult = await runWorkerTask(worker, { type: 'text', content: left });
        const rightResult = await runWorkerTask(worker, { type: 'text', content: right });
        leftConceptEmbedding = JSON.parse(leftResult);
        rightConceptEmbedding = JSON.parse(rightResult);
    } catch (error) {
        console.error('Worker error:', error);
    }

    const min = parseFloat(slider.min);
    const max = parseFloat(slider.max);
    const step = parseFloat(slider.step) || 1; // Default step is 1 if not specified

    const values = [];
    for (let value = min; value <= max; value += step) {
        values.push(roundToStep(value, step));
    }

    const topNForValue = {};
    const usedVectors = new Set();

    // greedy filling of slider
    for (const sliderValue of values) {
        const currentVectorQuery = interpolateVectorsLinear(leftConceptEmbedding, rightConceptEmbedding, sliderValue);
        topNForValue[sliderValue] = findTopNClosestVectors(currentVectorQuery, embeddings, values.length);
        for (const vector of topNForValue[sliderValue]) {
            if (!usedVectors.has(vector.embedding.embedding)) {
                embeddingQueries[sliderValue] = vector;
                usedVectors.add(vector.embedding.embedding);
                break;
            }
        }
    }

    slider.disabled = false;
}

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
});


// Main logic to determine image paths
const imagePaths = getImagePathsFromURL();
if (imagePaths) {
    loadImages(imagePaths);
    fetchImageEmbeddingsFromJSON();
} else {
    fetchImagesFromJSON();
    fetchImageEmbeddingsFromJSON();
}

