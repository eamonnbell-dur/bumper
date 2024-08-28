const canvas = document.getElementById('packingCanvas');
const ctx = canvas.getContext('2d');

let images = []; // Add your image paths here
const loadedImages = [];
let positions = [];
let dragging = false;
let dragIndex = -1;
let offsetX, offsetY;
let currentImageIndex = 0;

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
    }).catch(error => {
        console.error('Error loading images:', error);
    });
}

// Fetch the JSON file containing the image list
function fetchImagesFromJSON() {
    fetch('image_list.json')
        .then(response => response.json())
        .then(images => {
            const imagePaths = getRandomSlice(images, 10);
            updateURLWithImages(imagePaths);
            loadImages(imagePaths);
        })
        .catch(error => {
            console.error('Error fetching image list:', error);
        });
}

function updateURLWithImages(imagePaths) {
    const url = new URL(window.location);
    url.searchParams.set('images', imagePaths.join(','));
    window.history.replaceState({}, '', url);
}

function packImages() {
    loadedImages.forEach(img => {
        let placed = false;
        while (!placed) {
            const x = Math.random() * (canvas.width - img.width);
            const y = Math.random() * (canvas.height - img.height);
            const rotation = Math.random() * 360; // Random rotation
            positions.push({ img, x, y, rotation });
            placed = true;
        }
    });
    renderImages(positions);
}

function getImageData(img) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);
    return tempCtx.getImageData(0, 0, img.width, img.height);
}

function renderImages(positions) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    positions.forEach(pos => {
        ctx.save();
        ctx.translate(pos.x + pos.img.width / 2, pos.y + pos.img.height / 2);
        ctx.rotate(pos.rotation * Math.PI / 180);
        ctx.drawImage(pos.img, -pos.img.width / 2, -pos.img.height / 2);
        ctx.restore();
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
            break;
        }
    }


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
    document.getElementById('saveButton').addEventListener('click', () => {
        const link = document.createElement('a');
        link.download = 'canvas_image.png';
        link.href = canvas.toDataURL();
        link.click();
    });

    document.getElementById('refreshButton').addEventListener('click', () => {
        location.reload();
    });

    document.getElementById('homeButton').addEventListener('click', () => {
        window.location.href = '/';
    });
});

// Main logic to determine image paths
const imagePaths = getImagePathsFromURL();
if (imagePaths) {
    loadImages(imagePaths);
} else {
    fetchImagesFromJSON();
}
