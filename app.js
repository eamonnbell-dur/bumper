import {computeConvexHull, computeConvexHullArea, hullsIntersect, getImageData}  from './utils.js'

const canvas = document.getElementById('packingCanvas');
const ctx = canvas.getContext('2d');

let images = []; // Add your image paths here
const loadedImages = [];
let positions = [];
let dragging = false;
let dragIndex = -1;
let offsetX, offsetY;
let currentImageIndex = 0;
let selectedItem = null; // Global variable to store the selected item

let temperature = 1000;
const coolingRate = 0.01;
let currentEnergy;
let iteration = 0;
const redrawInterval = 10; // Adjust this value to control redraw frequency

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
            const imagePaths = getRandomSlice(images, 20);
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
        if (iteration % redrawInterval === 0) {
            renderImages(positions);
            renderHulls(positions);
        }
        requestAnimationFrame(renderLoop);
    }
    requestAnimationFrame(renderLoop);
}


function calculateEnergy(positions) {
    let energy = 0;
    for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
            if (hullsIntersect(positions[i].hull, positions[j].hull)) {
                energy += 1;
            }
        }
    }
    return energy;
}



function generateNeighbor(positions) {
    const newPositions = positions.map(pos => ({ ...pos }));
    const index = Math.floor(Math.random() * newPositions.length);  
    const jitterAmount = 20; 
    newPositions[index].x += (Math.random() - 0.5) * jitterAmount;
    newPositions[index].y += (Math.random() - 0.5) * jitterAmount;
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
    positions.forEach(pos => {
        ctx.save();
        ctx.translate(pos.x + pos.img.width / 2, pos.y + pos.img.height / 2);
        ctx.rotate(pos.rotation * Math.PI / 180);
        ctx.drawImage(pos.img, -pos.img.width / 2, -pos.img.height / 2);
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

    document.getElementById('renderHulls').addEventListener('click', () => {
        renderHulls(positions);
    });

    document.addEventListener('click', (e) => {
        const contextMenu = document.getElementById('contextMenu');
        if (e.target !== contextMenu && !contextMenu.contains(e.target)) {
            contextMenu.style.display = 'none';
        }
    });

    document.getElementById('dropdown').addEventListener('change', (e) => {
        selectedItem = e.target.value;
        console.log(`Selected item: ${selectedItem}`);
    });

    document.getElementById('searchInput').addEventListener('input', (e) => {
        const filter = e.target.value.toLowerCase();
        const options = document.getElementById('dropdown').options;
        for (let i = 0; i < options.length; i++) {
            const option = options[i];
            if (option.text.toLowerCase().includes(filter)) {
                option.style.display = '';
            } else {
                option.style.display = 'none';
            }
        }
    });
});

canvas.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY);
});

function showContextMenu(x, y) {
    const contextMenu = document.getElementById('contextMenu');
    contextMenu.style.left = `${x}px`;
    contextMenu.style.top = `${y}px`;
    contextMenu.style.display = 'block';
}

// Main logic to determine image paths
const imagePaths = getImagePathsFromURL();
if (imagePaths) {
    loadImages(imagePaths);
} else {
    fetchImagesFromJSON();
}
