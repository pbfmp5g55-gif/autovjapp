
import * as THREE from 'three';
import Delaunator from 'delaunator';

export class PhotoPolygonizer {
    constructor(scene) {
        this.scene = scene;
        this.meshes = [];
        this.group = new THREE.Group();
        this.centerOffset = new THREE.Vector3();
        this.mode = 'Delaunay'; // 'Delaunay' or 'Superpixel'

        // Settings
        this.polygonCountBase = 25; // User setting 10-100
        this.canvas = document.createElement('canvas'); // Internal canvas for processing
        this.ctx = this.canvas.getContext('2d');

        this.scene.add(this.group);
    }

    setMode(mode) {
        this.mode = mode;
    }

    setPolygonCount(count) {
        this.polygonCountBase = THREE.MathUtils.clamp(count, 10, 100);
    }

    // Main entry: Process an image file
    async processImage(file) {
        const bmp = await createImageBitmap(file);

        // Resize logic: keep small for performance
        const maxDim = 512;
        let w = bmp.width;
        let h = bmp.height;
        if (w > maxDim || h > maxDim) {
            const ratio = Math.min(maxDim / w, maxDim / h);
            w = Math.floor(w * ratio);
            h = Math.floor(h * ratio);
        }

        this.canvas.width = w;
        this.canvas.height = h;
        this.ctx.drawImage(bmp, 0, 0, w, h);

        const imageData = this.ctx.getImageData(0, 0, w, h);

        // Generate points
        const points = this.generatePoints(imageData, this.polygonCountBase);

        // Create meshes based on mode
        this.createMeshes(points, imageData);
    }

    // Generate distribution of points based on image features
    generatePoints(imageData, countVal) {
        const { width, height, data } = imageData;
        const points = [];

        // Add corners
        points.push([0, 0], [width, 0], [width, height], [0, height]);

        // Target number of points (approximate)
        // Scale user input (10-100) to actual point count
        // 10 -> ~50 points, 100 -> ~1000 points
        const numPoints = Math.floor(countVal * 10);

        // Random sampling weighted by edge detection could be better,
        // but for now let's use simple random + relax (Lloyd) for Superpixel
        // or edge-biased random for Low-poly.

        for (let i = 0; i < numPoints; i++) {
            points.push([Math.random() * width, Math.random() * height]);
        }

        return points;
    }

    createMeshes(points, imageData) {
        // Clear old
        this.clear();

        const { width, height } = imageData;

        // Offset to center
        this.centerOffset.set(-width / 2, -height / 2, 0);

        // Normalize points for Delaunator
        // Delaunator expects a flat array [x0, y0, x1, y1, ...]
        const coords = new Float64Array(points.length * 2);
        for (let i = 0; i < points.length; i++) {
            coords[i * 2] = points[i][0];
            coords[i * 2 + 1] = points[i][1];
        }

        const delaunay = new Delaunator(coords);

        if (this.mode === 'Delaunay') {
            this.buildDelaunayMeshes(delaunay, points, imageData);
        } else {
            this.buildVoronoiMeshes(delaunay, points, imageData);
        }

        // Scale down the whole group to fit in view
        const scale = 10 / Math.max(width, height);
        this.group.scale.set(scale, -scale, scale); // Y flip for canvas coord
        this.group.rotation.set(0, 0, 0);
    }

    buildDelaunayMeshes(delaunay, points, imageData) {
        const triangles = delaunay.triangles;
        const width = imageData.width;

        for (let i = 0; i < triangles.length; i += 3) {
            const i0 = triangles[i];
            const i1 = triangles[i + 1];
            const i2 = triangles[i + 2];

            const p0 = points[i0];
            const p1 = points[i1];
            const p2 = points[i2];

            // Get center for color sampling
            const cx = (p0[0] + p1[0] + p2[0]) / 3;
            const cy = (p0[1] + p1[1] + p2[1]) / 3;
            const color = this.sampleColor(imageData, cx, cy);

            // Create geometry
            const shape = new THREE.Shape();
            shape.moveTo(p0[0] + this.centerOffset.x, p0[1] + this.centerOffset.y);
            shape.lineTo(p1[0] + this.centerOffset.x, p1[1] + this.centerOffset.y);
            shape.lineTo(p2[0] + this.centerOffset.x, p2[1] + this.centerOffset.y);
            shape.lineTo(p0[0] + this.centerOffset.x, p0[1] + this.centerOffset.y);

            // Create 3D Geometry (Extrude for thickness)
            const depth = 20 + Math.random() * 30; // Substantial thickness
            const extrudeSettings = {
                depth: depth,
                bevelEnabled: false // Flat sides look cleaner for glitch art
            };
            const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

            // Use Standard Material for lighting/shading
            const material = new THREE.MeshStandardMaterial({
                color: color,
                roughness: 0.4,
                metalness: 0.1,
                emissive: color,
                emissiveIntensity: 0.25,
                flatShading: true,
                side: THREE.DoubleSide
            });

            const mesh = new THREE.Mesh(geometry, material);

            // Layout data for animation
            mesh.userData = {
                originalPos: mesh.position.clone(),
                center: new THREE.Vector3(cx + this.centerOffset.x, cy + this.centerOffset.y, 0),
                color: new THREE.Color(color),
                random: Math.random()
            };

            this.group.add(mesh);
            this.meshes.push(mesh);
        }
    }

    buildVoronoiMeshes(delaunay, points, imageData) {
        // Construct Voronoi cells from Delaunay triangulation
        // By connecting circumcenters of adjacent triangles
        const { width, height } = imageData;

        // Helper to get circumcenter
        function circumcenter(a, b, c) {
            const ad = a[0] * a[0] + a[1] * a[1];
            const bd = b[0] * b[0] + b[1] * b[1];
            const cd = c[0] * c[0] + c[1] * c[1];
            const D = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
            return [
                (1 / D) * (ad * (b[1] - c[1]) + bd * (c[1] - a[1]) + cd * (a[1] - b[1])),
                (1 / D) * (ad * (c[0] - b[0]) + bd * (a[0] - c[0]) + cd * (b[0] - a[0]))
            ];
        }

        const numTriangles = delaunay.triangles.length / 3;
        const centers = new Array(numTriangles); // Circumcenters

        for (let t = 0; t < numTriangles; t++) {
            const i0 = delaunay.triangles[t * 3];
            const i1 = delaunay.triangles[t * 3 + 1];
            const i2 = delaunay.triangles[t * 3 + 2];
            centers[t] = circumcenter(points[i0], points[i1], points[i2]);
        }

        // Iterate over points (which become Voronoi cells)
        // delaunay.halfedges provides neighbor info
        // Not optimal to iterate all, but for < 1000 points it's fine.
        // Better approach: Delaunay to Voronoi iteration.

        // We will process each point's surrounding triangles
        // A point is connected to multiple triangles.
        // We need an index map from point to incoming half-edges.
        // But Delaunator doesn't give this directly easily.

        // Alternative: Simple "Stained Glass" using just triangles but specialized colors?
        // No, user requested "Superpixel". Let's approximate Superpixel by 
        // simply merging triangles that are similar color?
        // Or actually implementing the dual graph.

        // Let's implement Dual Loop.
        const seen = new Set();

        for (let e = 0; e < delaunay.triangles.length; e++) {
            const pIndex = delaunay.triangles[e];
            if (seen.has(pIndex)) continue;
            seen.add(pIndex);

            // Walk around the point `pIndex` to find all incident triangles
            const cellPoly = [];
            let startEdge = e;
            let currEdge = e;

            // Find an incoming edge to start (optional, standard traversal handles it)
            // But let's just loop around the vertex pIndex.
            // Using standard formula: next half-edge in triangle is e % 3 === 2 ? e - 2 : e + 1
            // opposite is halfedges[e]

            // Actually, simpler method for Voronoi in JS without complex traversal:
            // Just use the points as sites and a simple logic if we can.
            // But since we want Mesh, we need vertices.

            // Let's fallback to "Centroid Triangulation" for Stained Glass 2 (easier to implement reliably)
            // Just move the points to the centroid of their triangles and create a dual mesh?
            // Or...
            // Use the triangles we already have but color them differently?
            // No, the shape must be different.

            // Let's stick to Delaunay for now to ensure robustness, but change the points distribution for "Glass" Mode
            // to be very regular (Hexagonal), which creates a honeycomb/stained glass look when triangulated.

            // WAITING: Implementing full Voronoi mesh construction is complex and error-prone in one shot.
            // STRATEGY CHANGE for Stained Glass:
            // Use Delaunay but with "Relaxed" points (Lloyd's algorithm 2-3 iterations)
            // This makes triangles very regular (equilateral).
            // Then, for the mesh, we keep it as triangles but with flat shading and heavy wireframe (gap) to look like glass pieces.
            // Real Voronoi is better but let's see.

            // ACTUALLY, I will process the Dual Graph properly for Voronoi if possible.
            // Let's try a simplified cell extraction:
            // For each point, build a shape from its adjacent triangles' circumcenters.

            const voronoiVertices = [];
            let incoming = e;
            let doLoop = true;

            // Start walk
            do {
                const t = Math.floor(incoming / 3);
                voronoiVertices.push(centers[t]);

                const next = (incoming % 3 === 2) ? incoming - 2 : incoming + 1;
                incoming = delaunay.halfedges[next];

                if (incoming === -1 || incoming === e) doLoop = false;
            } while (doLoop);

            if (voronoiVertices.length > 2) {
                // Build mesh
                const shape = new THREE.Shape();
                const start = voronoiVertices[0];
                shape.moveTo(start[0] + this.centerOffset.x, start[1] + this.centerOffset.y);
                for (let k = 1; k < voronoiVertices.length; k++) {
                    const v = voronoiVertices[k];
                    shape.lineTo(v[0] + this.centerOffset.x, v[1] + this.centerOffset.y);
                }
                shape.lineTo(start[0] + this.centerOffset.x, start[1] + this.centerOffset.y);

                const centerP = points[pIndex];
                const color = this.sampleColor(imageData, centerP[0], centerP[1]);

                // Create 3D Geometry
                const depth = 20 + Math.random() * 30;
                const extrudeSettings = {
                    depth: depth,
                    bevelEnabled: false
                };
                const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

                // Standard Material
                const material = new THREE.MeshStandardMaterial({
                    color: color,
                    roughness: 0.4,
                    metalness: 0.1,
                    emissive: color,
                    emissiveIntensity: 0.25,
                    flatShading: true
                });
                const mesh = new THREE.Mesh(geometry, material);

                mesh.userData = {
                    originalPos: mesh.position.clone(),
                    center: new THREE.Vector3(centerP[0] + this.centerOffset.x, centerP[1] + this.centerOffset.y, 0),
                    color: new THREE.Color(color),
                    random: Math.random()
                };

                this.group.add(mesh);
                this.meshes.push(mesh);
            }
        }
    }

    sampleColor(imageData, x, y) {
        x = Math.floor(THREE.MathUtils.clamp(x, 0, imageData.width - 1));
        y = Math.floor(THREE.MathUtils.clamp(y, 0, imageData.height - 1));
        const i = (y * imageData.width + x) * 4;
        return new THREE.Color(
            imageData.data[i] / 255,
            imageData.data[i + 1] / 255,
            imageData.data[i + 2] / 255
        );
    }

    clear() {
        this.meshes.forEach(m => {
            m.geometry.dispose();
            m.material.dispose();
            this.group.remove(m);
        });
        this.meshes = [];
    }

    update(audio, midi) {
        if (this.meshes.length === 0) return;

        // VJ Effects on Polygons
        const time = performance.now() * 0.001;
        const beat = audio.beat;
        const bass = audio.low;

        // CC Mapping
        // CC1: Intensity (Scale Z)
        // CC2: Hue Shift
        // CC3: Zoom (handled by cam)
        // CC4: Deform / Explode

        const explodeAmt = midi.cc4 * 5 + beat * 2;
        const zDepth = midi.cc1 * 5 + bass * 5;

        this.meshes.forEach((mesh, i) => {
            const data = mesh.userData;
            const dist = data.center.length() / 200; // Normalized distance

            // Base position starts from original
            let targetPos = data.originalPos.clone();

            // 1. Wave Effect (Low Freq)
            const wave = Math.sin(time * 2 + dist * 5) * bass * 20;
            targetPos.z += wave;

            // 2. Ripple Effect (Beat)
            // A pulse traveling outwards
            const rippleSpeed = 5.0;
            const ripplePos = (time * rippleSpeed) % 10.0; // 0 to 10 cycle
            const rippleDist = Math.abs(dist * 10 - ripplePos);
            if (rippleDist < 1.0) {
                const rippleForce = (1.0 - rippleDist) * beat * 30; // Push Z
                targetPos.z += rippleForce;
            }

            // 3. Mode Specific Effects
            if (this.mode === 'Delaunay') {
                // Shard Explode (High Freq reaction)
                // Scatter pieces outward sharply
                const shard = audio.high * 50 * data.random;
                const dir = data.center.clone().normalize();
                targetPos.add(dir.multiplyScalar(shard * midi.cc4)); // CC4 scales explosion

                // Random Rotation on kick
                if (beat > 0.5) {
                    mesh.rotation.x += (Math.random() - 0.5) * 0.5;
                    mesh.rotation.y += (Math.random() - 0.5) * 0.5;
                }
                // Damping rotation
                mesh.rotation.x *= 0.9;
                mesh.rotation.y *= 0.9;

            } else {
                // Stained Glass Breathing (Organic)
                // Scale cells based on mid frequencies
                const breath = 1.0 + Math.sin(time * 3 + i) * 0.1 * midi.cc4;
                const audioScale = 1.0 + audio.mid * 0.5;
                const totalScale = breath * audioScale;
                mesh.scale.setScalar(totalScale);

                // Gentle swaying
                targetPos.x += Math.sin(time + dist) * 5 * midi.cc4;
                targetPos.y += Math.cos(time + dist) * 5 * midi.cc4;
            }

            // Apply Explode (General)
            const dir = data.center.clone().normalize();
            targetPos.add(dir.multiplyScalar(explodeAmt * data.random));

            // Lerp to target
            mesh.position.lerp(targetPos, 0.2);

            // Color Hue Shift
            if (midi.cc2 > 0.05) {
                const hsl = {};
                data.color.getHSL(hsl);
                mesh.material.color.setHSL(
                    (hsl.h + midi.cc2 + time * 0.1) % 1.0,
                    hsl.s,
                    hsl.l
                );
            } else {
                mesh.material.color.copy(data.color);
            }
        });
    }
}
