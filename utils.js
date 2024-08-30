
export function computeConvexHull(imageData) {
    const points = [];
    for (let y = 0; y < imageData.height; y++) {
        for (let x = 0; x < imageData.width; x++) {
            const alpha = imageData.data[(y * imageData.width + x) * 4 + 3];
            if (alpha > 0) {
                points.push({ x, y });
            }
        }
    }

    if (points.length < 3) return points;

    const hull = [];
    let leftmost = points.reduce((left, p) => (p.x < left.x ? p : left), points[0]);
    let current = leftmost;

    do {
        hull.push(current);
        let next = points[0];
        for (let i = 1; i < points.length; i++) {
            if (next === current || isCounterClockwise(current, next, points[i])) {
                next = points[i];
            }
        }
        current = next;
    } while (current !== leftmost);

    return hull;
}

export function computeConvexHullArea(hull) {
    let area = 0;
    const n = hull.length;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        area += hull[i].x * hull[j].y;
        area -= hull[j].x * hull[i].y;
    }

    return Math.abs(area) / 2;
}

export function offsetHull(hull, offsetX, offsetY) {
    return hull.map(point => ({
        x: point.x + offsetX,
        y: point.y + offsetY
    }));
}

export function getImageData(img) {
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = img.width;
    tempCanvas.height = img.height;
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.drawImage(img, 0, 0);
    return tempCtx.getImageData(0, 0, img.width, img.height);
}

export function hullsIntersect(hull1, hull2) {
    return hull1.some(point => isPointInHull(point, hull2)) || hull2.some(point => isPointInHull(point, hull1));
}

function isPointInHull(point, hull) {
    let count = 0;
    for (let i = 0; i < hull.length; i++) {
        const a = hull[i];
        const b = hull[(i + 1) % hull.length];
        if (rayIntersectsSegment(point, a, b)) {
            count++;
        }
    }
    return count % 2 === 1;
}

function rayIntersectsSegment(p, a, b) {
    if (a.y > b.y) [a, b] = [b, a];
    if (p.y === a.y || p.y === b.y) p.y += 0.0001;
    if (p.y < a.y || p.y > b.y || p.x >= Math.max(a.x, b.x)) return false;
    if (p.x < Math.min(a.x, b.x)) return true;

    const red = (p.y - a.y) / (p.x - a.x);
    const blue = (b.y - a.y) / (b.x - a.x);
    return red >= blue;
}

function isCounterClockwise(p1, p2, p3) {
    return (p2.x - p1.x) * (p3.y - p1.y) - (p2.y - p1.y) * (p3.x - p1.x) > 0;
}

export function interpolateVectorsLinear(vec1, vec2, t) {
    const result = {};
    for (const key in vec1) {
        if (vec1.hasOwnProperty(key) && vec2.hasOwnProperty(key)) {
            result[key] = vec1[key] * (1 - t) + vec2[key] * t;
        }
    }
    return result;
}

export function interpolateVectorsSpherical(vec1, vec2, t) {
    const dot = vec1.x * vec2.x + vec1.y * vec2.y + vec1.z * vec2.z;
    const theta = Math.acos(Math.max(-1, Math.min(1, dot)));
    const sinTheta = Math.sin(theta);

    if (sinTheta < 0.001) {
        return {
            x: vec1.x * (1 - t) + vec2.x * t,
            y: vec1.y * (1 - t) + vec2.y * t,
            z: vec1.z * (1 - t) + vec2.z * t
        };
    }

    const a = Math.sin((1 - t) * theta) / sinTheta;
    const b = Math.sin(t * theta) / sinTheta;

    return {
        x: vec1.x * a + vec2.x * b,
        y: vec1.y * a + vec2.y * b,
        z: vec1.z * a + vec2.z * b
    };
}
