/**
 * dat.globe Javascript WebGL Globe Toolkit
 * http://dataarts.github.com/dat.globe
 *
 * Copyright 2011 Data Arts Team, Google Creative Lab
 *
 * Licensed under the Apache License, Version 2.0 (the 'License');
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 * http://www.apache.org/licenses/LICENSE-2.0
 */

var DAT = DAT || {};

DAT.Globe = function(initOpts, worker) {
    var opts = {};
    
    if (worker == undefined || !worker) {
        
        // override errors/warnings
        window.onunload     = stop;
        window.console.warn = function() {};
        
        // Colors only relevant if we need to render something
        opts.color = {
            scale: chroma.interpolate.bezier(['#f7f7ff', '#35d7ee', '#178aeb', '#0a54a8', '#053163']),
            domain: [0, 192],
            correct: true
        };
        
        opts.container = $('#container')[0];
    }
    
    opts.isWorker = worker || false;
    
    opts.imgDir = 'globe/';
    opts.images = {
        earth:          'images/world-hd.jpg',
        earthBumpMap:   'images/elevation.jpg'
    };
    
    opts.shaders = {
        'earth' : {
            uniforms: {
                'texture': { type: 't', value: null }
            },
            vertexShader: [
                'varying vec3 vNormal;',
                'varying vec2 vUv;',
                'void main() {',
                    'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
                    'vNormal = normalize( normalMatrix * normal );',
                    'vUv = uv;',
                '}'
            ].join('\n'),
            fragmentShader: [
                'uniform sampler2D texture;',
                'varying vec3 vNormal;',
                'varying vec2 vUv;',
                'void main() {',
                    'vec3 diffuse = texture2D( texture, vUv ).xyz;',
                    'float intensity = 1.05 - dot( vNormal, vec3( 0.0, 0.0, 1.0 ) );',
                    'vec3 atmosphere = vec3( 1.0, 1.0, 1.0 ) * pow( intensity, 3.0 );',
                    'gl_FragColor = vec4( diffuse + atmosphere, 1.0 );',
                '}'
            ].join('\n')
        },
        'atmosphere' : {
            uniforms: {},
            vertexShader: [
                'varying vec3 vNormal;',
                'void main() {',
                    'vNormal = normalize( normalMatrix * normal );',
                    'gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );',
                '}'
            ].join('\n'),
            fragmentShader: [
                'varying vec3 vNormal;',
                'void main() {',
                    'float intensity = pow( 0.8 - dot( vNormal, vec3( 0, 0, 1.0 ) ), 16.0 );',
                    'gl_FragColor = vec4( 1, 1, 1, 0.5) * intensity;',
                '}'
            ].join('\n')
        }
    };
    
    opts.repaint        = true;
    
    opts.fps            = 60;
    opts.rotate         = true;
    
    // Size of spheres and globe points
    opts.radius         = 200;
    opts.pointSize      = 1;
    
    opts.numWorkers     = 6;
    
    // Native object extension
    opts = (function(target, source) {
              target = target || {};
              for (var prop in source) {
                if (typeof source[prop] === 'object') {
                  target[prop] = extend(target[prop], source[prop]);
                } else {
                  target[prop] = source[prop];
                }
              }
              return target;
           })(opts, initOpts || {});
    
    var PI_HALF = Math.PI / 2;
    
    var colors = [];
    
    var workers = [], 
        jobs = [];
    
    // Camera distance from earth
    var zoomSpeed      = 50,
        distance       = 975,
        distanceTarget = 975;
   
    // Initial Rotation
    var rotation       = { x: Math.PI+0.4, y: 50/180 },
        target         = { x: Math.PI+0.4, y: 50/180 },
        targetOnDown   = { x: Math.PI+0.4, y: 50/180 };
    
    // Mouse Location
    var mouse          = { x: 0, y: 0 },
        mouseOnDown    = { x: 0, y: 0 },
        pointer        = { x: 0, y: 0 };
    
    var tweenStarted   = false;
    
    var camera, scene, light, renderer, overRenderer, w, h, active,
        point, points, basegeo, projector,
        vector = new THREE.Vector3();
    
    var meshProperties = {
        tween: null,
        _time: 0,
        current: 0,
        next: 0,
        influence: 0,
        currentInfluence: [1],
        influences: [0],
        lastRepaint: 0,
        repainting: false
    };
    
    var geometry    = new THREE.CubeGeometry(opts.pointSize, opts.pointSize, opts.pointSize);
    geometry.applyMatrix(new THREE.Matrix4().makeTranslation(0,0,-0.5));
        
    point           = new THREE.Mesh(geometry);
    
    dispose(geometry);
    geometry = undefined;
    
    function buildColors() {
        var peak, base, color, std;
        
        var scale = chroma.scale(opts.color.scale)
                            .domain(opts.color.domain || [0, 192], 255)
                                .correctLightness(opts.color.correct).mode('hsl');
        
        // Pre-calculate vertex colors for every possible index
        for (var i = 0; i < 256; ++i) {
            
            peak        = scale(i).hsl();
            base        = scale(i).hsl();
            color       = new THREE.Color();
            std         = new THREE.Color();
            
            peak[0] /= 360;
            base[0] /= 360;
            
            color.setHSL.apply(color, peak);
            std.setHSL.apply(std, base);
            
            colors[i] = [
                [std, std, color],      [std, color, color],
                [color, color, std],    [color, std, std],
                [color, std, color],    [std, std, color],
                [std, color, std],      [color, color, std],
                [std, std, std],        [std, std, std],
                [color, color, color],  [color, color, color]
            ];
        }
    }
    
    function init() {
        
        var shader, uniforms, material, mesh, geometry, texture;
        w = opts.container.offsetWidth;
        h = opts.container.offsetHeight;
        
        camera              = new THREE.PerspectiveCamera(30, w / h, 10, 10000);
        camera.position.z   = distance;
        
        scene               = new THREE.Scene();
        
        light               = new THREE.PointLight(0xffffff);
        light.name          = "Light";
        light.position.set(opts.radius * 1.5, opts.radius * 1.5, opts.radius * 1.5);
        scene.add(light);
        
        // Build the earth
        geometry            = new THREE.SphereGeometry(opts.radius, 40, 40);
        geometry.dynamic    = false;
        
        shader      = opts.shaders['earth'];
        uniforms    = THREE.UniformsUtils.clone(shader.uniforms);
        
        material = new THREE.MeshPhongMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            specular: '#000000',
            ambient: '#000000',
            emissive: '#333333',
            diffuse: '#FFFFFF',
            shininess: 0,
            map: THREE.ImageUtils.loadTexture(opts.imgDir + opts.images['earth']),
            bumpMap: THREE.ImageUtils.loadTexture(opts.imgDir + opts.images['earthBumpMap']),
            bumpScale: 10
        });
        
        mesh        = new THREE.Mesh(geometry, material);
        mesh.name   = "Earth";
        mesh.rotation.y = Math.PI;
        scene.add(mesh);
        
        // Build the atmosphere
        shader      = opts.shaders['atmosphere'];
        uniforms    = THREE.UniformsUtils.clone(shader.uniforms);
        
        material    = new THREE.ShaderMaterial({
            uniforms: uniforms,
            vertexShader: shader.vertexShader,
            fragmentShader: shader.fragmentShader,
            side: THREE.BackSide,
            blending: THREE.AdditiveBlending,
            transparent: true
        });
        
        mesh        = new THREE.Mesh(geometry, material);
        mesh.name   = "Atmosphere";
        mesh.scale.set( 1.12, 1.12, 1.12 );
        scene.add(mesh);
        
        // Cleanup
        dispose(material, geometry);
        mesh = material = geometry = undefined;
        
        renderer                            = new THREE.WebGLRenderer({alpha: true, antialias: true});
        renderer.context.getProgramInfoLog  = function () { return '' };
        renderer.domElement.style.position  = 'absolute';
        
        renderer.setSize(w, h);
        opts.container.appendChild(renderer.domElement);
        
        projector = new THREE.Projector();
        
        // Render a few frames
        renderFrames(1);
        buildColors();
        
        opts.container.addEventListener('mousedown', onMouseDown, false);
        opts.container.addEventListener('mousewheel', onMouseWheel, false);
        document.addEventListener('keydown', onDocumentKeyDown, false);
        opts.container.addEventListener('mouseover', function() {
            overRenderer = true;
        }, false);
        opts.container.addEventListener('mouseout', function() {
            overRenderer = false;
        }, false);
        opts.container.addEventListener('mousemove', function(e) {
            pointer.x = e.x;
            pointer.y = e.y;
        });
        window.addEventListener('resize', onWindowResize, false);
        
        return this;
    }
    
    function timedChunk(context, length, fn, cb) {
        var n = length, i = 0, cb = cb || function() {};
        
        var chunkTimer = function() {
            var start = new Date().getTime();
            
            while (i < n && (new Date().getTime() - start < (1000 / (opts.fps * 4)))) {
                fn.call(context, i);
                i += 1;
            }
            
            if (i < n)
                setTimeout(chunkTimer, 5);
            else 
                cb.call(context);
        };
        
        setTimeout(chunkTimer, 0);
    }
    
    function pointBufferParser(buffer, index, cb) {
        
        // Point buffer consists of a 12 byte header, 4 bytes each for rows, columns and max point size
        //      Max point size * index / 255 is the actual value for that point (but may already be scaled once on backend)
        // Each point is represented by two 2 byte ints for lat & long, plus 1 byte index value for each point on the timeline
        var dv      = new DataView(buffer),
            rows    = dv.getUint32(0, true),
            columns = dv.getUint32(4, true),
            max     = dv.getUint32(8, true),
            data    = [];
        
        var j, k, row;
        
        timedChunk(null, rows, function(i) {
            
            for (j = 0; j < 3; ++j) {
            
                // These are index values, originally from 0-255, we use them internally as 0-1
                if (j > 1) {
                    data.push(dv.getUint8(12 + (columns + 2) * i + 4 + index) / 255);
                
                // First 2 values are the lat & long, divide by 100 to get decimal places back
                } else {
                    data.push(dv.getInt16(12 + (columns + 2) * i + j * 2, true) / 100);
                }
            }
            
        }, function() {
            
            if (cb)
                cb(data);
        });
    }
    
    function vertexBufferParser(buffer, cb) {
        
        // buffer has a 4 byte vertex count header
        //  Each set of 8 vertices is prefixed with a scalar index value for the size of the point
        //  Each vertex is 3 floats of its respective x,y,z coords
        var dv          = new DataView(buffer),
            vertexCount = dv.getUint32(0, true),
            points      = vertexCount / 8,
            vertices    = [];
            
        timedChunk(null, vertexCount, function(i) {
            var point = Math.floor(i/8);
            
            vertices[i] = new THREE.Vector3(
                dv.getFloat32(4 + (i * 3 * 4) + point + 1, true),
                dv.getFloat32(8 + (i * 3 * 4) + point + 1, true),
                dv.getFloat32(12 + (i * 3 * 4) + point + 1, true)
            );
            
            if ( !(i % 8) )
                vertices[i].size = dv.getUint8(4 + (i * 3 * 4) + point);
        
        }, function() {
            
            if (cb)
                cb(vertices);
        });
    }
    
    function verticesToBuffer(vertices, cb) {
        
        // Each rectangle has 8 verticies, and each vertex contains 3 positional floats
        //  Before every group of 8 vertexs is a single byte scalar index of the points relative height
        //  4 byte header
        var len = vertices.length,
            ab  = new ArrayBuffer(len/8 + len * 3 * 4 + 4),
            dv  = new DataView(ab),
            coords = ['x', 'y', 'z'],
            j, point;
        
        // Write header of # of vertices
        dv.setUint32(0, len, true);
        
        timedChunk(null, len, function(i) {
            
            point = Math.floor(i/8);
            
            // Before every 8 vertices we add the scalar index size
            if ( !(i % 8) )
                dv.setUint8(4 + (i * 3 * 4) + point, Math.floor(Math.pow(vertices[i + 1].distanceTo(vertices[i]) / 50, 1/2) * 255));
                
            // 3 coordinates for each vector
            for (j = 0; j < 3; ++j)
                dv.setFloat32(4 + (i * 3 * 4) + point + 1 + (j * 4), vertices[i][coords[j]], true);
        
        }, function() {
            
            if (cb)
                cb(ab);
        });
    }
    
    // A simple web worker queue system so we don't crash the browser
    function processQueue() {
        
        if (workers.length < opts.numWorkers && jobs.length > 0) {
            var job     = jobs.splice(0, 1)[0],
                worker  = new Worker(job.script);
            
            // add worker to worker list
            workers.push(worker);
            
            worker.onmessage = function(response) {
                // Stop the worker if its still running
                worker.terminate();
                
                // Remove it from the queue of workers
                workers.splice(workers.indexOf(worker), 1);
                worker = undefined;
                
                // Deliver the message
                job.onmessage(response, job.id || 0);
                
                // Process additional jobs
                setTimeout(processQueue, 0);
            }
            
            $.each(job.messages, function(i, msg) {
                
                if (msg instanceof ArrayBuffer && job.pass)
                    worker.postMessage(msg, [msg]);
                else
                    worker.postMessage(msg);
            });
            
            processQueue();
        }
    }
    
    // Load a binary file via ajax
    function loadBin(file, cb) {
        var xhr             = new XMLHttpRequest();
        xhr.responseType    = 'arraybuffer';
        
        xhr.open('GET', file, true);
        
        xhr.onload = function(e) {
            cb(this.response);
        };
        
        xhr.send();
    }
    
    // Full process of loading a point mesh from a binary file
    function workerLoader(file, cb) {
        var self = this;
        NProgress.start();
        
        loadBin(file, function(ab) {
            
            var dv          = new DataView(ab),
                columns     = dv.getUint32(4, true),
                length      = columns - 2,
                remaining   = length,
                basegeo     = undefined,
                responses   = [];
            
            // Once we build both the base geometry and all vertices, fire this function
            var complete = function() {
                
                if (!remaining && basegeo)
                    meshBuilder.call(self, basegeo, responses, function(response) {
                        
                        dispose(basegeo);
                        responses = undefined;
                        
                        NProgress.done();
                        
                        if (cb)
                            cb(response);
                    });
            }
            
            // Collect each set of vertices from the workers
            var onmessage = function(response, index) {
                
                // Parse vertex from the array buffer
                vertexBufferParser(response.data, function(vertices) {
                    NProgress.inc(1/length);
                    responses[index] = vertices;
                    
                    if ( !(--remaining) )
                        complete();
                });
            }
            
            // Actually build the base geometry
            pointBufferParser(ab, 0, function(data) {
                geometryBuilder(data, {}, function(response) {
                    basegeo = response.basegeo;
                    
                    complete();
                });
            });
            
            // Create a job to caluate the vertices for each set of points
            for (var i = 0; i < length; ++i) {
                jobs.push({
                    script: 'globe/worker.js', 
                    messages: [ab, {file: file, index: i}],
                    pass: false,
                    onmessage: onmessage,
                    id: i
                });
            }
            
            // Begin spawning workers
            processQueue();
        });
    }
    
    function geometryBuilder(data, params, callback) {
        params.animated       = params.animated || true;
        params.format         = params.format || 'magnitude';
        params.step           = (params.format === 'magnitude')? 3: 4;
        
        params.basegeo          = new THREE.Geometry();
        params.basegeo.dynamic  = true;
        
        if (params.animated) {
            var nodes = data.length / 3,
                base;
            
            timedChunk(null, nodes, function(index) {
                
                base = index * 3;
                addPoint(
                    data[base], 
                    data[base + 1], 
                    Math.pow(data[base + 2], 2) * 50, 
                    !opts.isWorker? data[base + 2]: undefined, 
                    params.basegeo
                );
                
            }, function() {
                
                if (callback)
                    callback(params);
            });
        }
    }
    
    function meshBuilder(geometry, vertices, cb) {
        
        // Add all the vertices as morph targets to the geometry
        $.each(vertices, function(i, v) {
            geometry.morphTargets.push({'name': 'series' + i, vertices: v});
        });
        
        // Build the actual point mesh
        createPoints.call(this, {basegeo: geometry});
        
        // Render a single frame for now to update what we have
        if (!opts.isWorker)
            renderFrames(1);
        
        if (cb)
            cb(points);
    }
    
    function addPoint(lat, lng, size, index, geo) {
        var phi     = (90 - lat) * Math.PI / 180;
        var theta   = (180 - lng) * Math.PI / 180;
        
        point.position.x = (opts.radius - 1) * Math.sin(phi) * Math.cos(theta);
        point.position.y = (opts.radius - 1) * Math.cos(phi);
        point.position.z = (opts.radius - 1) * Math.sin(phi) * Math.sin(theta);
        
        point.lookAt(vector);
        
        if (size >= 0 && index === undefined)
            point.scale.z = Math.max( size, 0.01 ); // avoid non-invertible matrix
        else
            point.scale.z = 0.01;
        
        if (index !== undefined) {
            
            var faces = point.geometry.faces.length,
                index = Math.floor(index * 255);
            
            for ( var i = 0; i < faces; i++ )
                point.geometry.faces[i].vertexColors = colors[ index ][i];
            
            point.geometry.vertices[0].size = index;
        }
        
        THREE.GeometryUtils.merge(geo, point);
    }
    
    function createPoints(params) {
        
        // Build point mesh
        var points = new THREE.Mesh(params.basegeo, new THREE.MeshBasicMaterial({
            color: 0xffffff,
            vertexColors: THREE.VertexColors,
            morphTargets: params.basegeo.morphTargets.length? true: false,
            transparent: true
        }));
        
        addPrototypes(points);
        
        if (this.points !== undefined && 
            points.morphTargetInfluences.length == this.points.morphTargetInfluences.length) {
            
            points.morphTargetInfluences = this.points.morphTargetInfluences;
            
            var self = this;
            $.each(meshProperties, function(i, v) {
                
                points[i] = self.points[i];
            });
            self = undefined;
        }
        
        // 1st influence = basegeometry
        //points.morphTargetInfluences[0] = 1;
        points.repaint.call(points, true);
        
        points.name = "Points";
        scene.add(points);
        
        this.points = points;
    }
    
    function renderFrames(amount) {
        if (!active) {
            
            var frames = 0,
                frame = 0,
                frameLoop = function() {
                    render();
                    
                    if (frames++ < amount) {
                        frame = requestAnimationFrame(frameLoop)
                    } else {
                        cancelAnimationFrame(frame);
                        active = undefined;
                    }
                };
            
            frameLoop();
        }
    }
    
    function animate() {
        active = active || true;
        
        if (active) {
            active = requestAnimationFrame(animate);
            render();
        }
    }
    
    function stop() {
        
        if (active)
            cancelAnimationFrame(active);
        
        active = undefined;
        
        // Cleanup all resources that we can
        while (scene && scene.children && scene.children.length)
            dispose(scene.children[0]);
        
        dispose(camera, scene, light, point, points, vector);
        
        opts = camera = points = point = light = vector = data = globe = scene = renderer = colors = undefined;
        window.globe = undefined;
    }
    
    function dispose() {
        // YOLO memory management for workers
        if (opts.isWorker)
            return;
        
        $.each(arguments, function(i, obj) {
            
            if (obj !== undefined) {
                
                $.each(obj, function(el, property) {
                    if (obj[property] !== undefined && obj[property].hasOwnProperty('dispose'))
                        obj[property].dispose();
                });
                
                if (obj.hasOwnProperty('dispose'))
                    obj.dispose();
                
                if (scene !== undefined)
                    scene.remove(obj);
                
                obj = undefined;
            }
        });
    }
    
    // TODO...
    function checkSelection() {
        // find intersections
        if (points == undefined) return;
        // create a Ray with origin at the mouse position
        //   and direction into the scene (camera direction)
        var vector = new THREE.Vector3( (pointer.x / window.innerHeight) * 2 - 1, - ( pointer.y / window.innerWidth ) * 2 + 1, 1 );
        projector.unprojectVector( vector, camera );
        var ray = new THREE.Raycaster( camera.position, vector.sub( camera.position ).normalize() );
        //console.log(ray);
        // create an array containing all objects in the scene with which the ray intersects
        var intersects = ray.intersectObjects( [points] );
    }
    
    function render() {
        zoom(0);
        TWEEN.update();
        
        rotation.x += (target.x - rotation.x) * 0.1;
        rotation.y += (target.y - rotation.y) * 0.1;
        distance   += (distanceTarget - distance) * 0.3;
        
        // Auto rotate the globe
        if (opts.rotate)
            target.x   += 0.00032;
        
        // Set camera position
        camera.position.x = distance * Math.sin(rotation.x) * Math.cos(rotation.y);
        camera.position.y = distance * Math.sin(rotation.y);
        camera.position.z = distance * Math.cos(rotation.x) * Math.cos(rotation.y);
                            
        // Position light slopts.ightly behind camera on left side, so that shadow is cast on right edge
        light.position.x = distance * Math.sin(rotation.x-0.4) * Math.cos(rotation.y);
        light.position.y = distance * Math.sin(rotation.y);
        light.position.z = distance * Math.cos(rotation.x-0.4) * Math.cos(rotation.y);
        
        camera.lookAt(vector);
        renderer.render(scene, camera);
    }
    
    this.__defineGetter__('points', function() {
        return points || undefined;
    });
    
    this.__defineSetter__('points', function(p) {
        
        if (points !== undefined)
            dispose(points);
        
        points = undefined;
        points = p;
    });
    
    this.__defineGetter__('basegeo', function() {
        return basegeo || undefined;
    });
    
    this.__defineSetter__('basegeo', function(b) {
        if (basegeo !== undefined)
            dispose(basegeo);
        
        basegeo = b || undefined;
    });
    
    this.__defineGetter__('scene', function() {
        return scene || undefined;
    });
    
    this.__defineSetter__('color', function(color) {
        
        opts.color = $.extend(opts.color, color);
        
        // Rebuild color indexes
        buildColors();
        
        // Repaint
            points.repaint.call(points, true);
    });
    
    function addPrototypes(obj) {
        
        $.extend(obj, meshProperties);
        
        obj.__defineGetter__('time', function() {
            return this._time || 0;
        });
        
        obj.__defineSetter__('time', function(t) {
            
            if (this.next != this.current) {
                
                var length                          = this.morphTargetInfluences.length,
                    floor                           = Math.floor(this.next),
                    floor1                          = (floor + 1) % (length-1),
                    influences                      = [floor, floor1],
                    morphTargetInfluences           = new Array(length),
                    currentInfluence                = this.currentInfluence,
                    floorDist                       = this.currentInfluence[floor] - (1 - (this.next - floor)), 
                    floor1Dist                      = this.currentInfluence[floor1] - (this.next - floor),
                    influenceSize                   = (floorDist * t / floorDist);
                
                morphTargetInfluences[floor]    = this.currentInfluence[floor] - floorDist * t;
                morphTargetInfluences[floor1]   = this.currentInfluence[floor1] - floor1Dist * t;
                
                // Reduce the intermediate influences
                $.each(currentInfluence, function(i, v) {
                    if (morphTargetInfluences[i] == undefined) {
                        morphTargetInfluences[i] = Math.max(Math.round(currentInfluence[i] * (1 - influenceSize) * 100) / 100 - 0.01, 0);
                        
                        if (morphTargetInfluences[i] > 0)
                            influences.push(i);
                    
                    }
                });
                
                this._time                  = t;
                this.influences             = influences;
                
                var self = this;
                $.each(morphTargetInfluences, function(i, v) {
                    self.morphTargetInfluences[i] = isNaN(v)? 0: v;
                });
            }
        });
        
        obj.animate = function(index, duration, cb) {
            var len     = this.morphTargetInfluences.length,
                end     = index < this.current? len: index;
            
            // Don't animate outside of our range
            if (index > len)
                return;
            
            if (cb == undefined)
                cb = function() {};
            
            duration    = duration || Math.max(Math.abs(end - this.current) * 1000, 1000);
            
            // If tween is stopping, figure out where it is located
            if (this.tween) {
                this.tween.stop();
                this.tween = undefined;
                this.next += (this.current - this.next) * this._time;
            }
            
            this.currentInfluence   = this.morphTargetInfluences.slice(0);
            this.current            = this.next;
            this.next               = index;
            this.time               = 0;
            
            this.tween = new TWEEN.Tween(this)
                .stop()
                    .to({time: 1}, duration)
                        .easing(TWEEN.Easing.Linear.EaseNone)
                            .start()
                                .onUpdate(function() { this.repaint.call(this, false) })
                                    .onComplete(function() {
                                        this.repaint.call(this, true)
                                        cb.call(this);
                                    });
        }
        
        obj.repaint = function(force) {
            force = force || false;
            
            // Ensure repaint only happens if change is > 5%
            if (force || (!this.repainting && globe.opts.repaint &&
                    new Date().getTime() > this.lastRepaint + (1000 / (opts.fps)) * 1)) {
                
                this.repainting  = true;
                this.lastRepaint = new Date().getTime();
                
                var influences  = this.influences,
                    paint       = this.lastRepaint,
                    scale       = this.morphTargetInfluences;
                
                timedChunk(this, this.geometry.faces.length / 12, function(i) {
                    var j, size = 0, self = this;
                        
                    $.each(influences, function(j, v) {
                        size += self.geometry.morphTargets[v].vertices[i * 8].size * scale[v];
                    });
                    
                    size = Math.floor(size);
                    size = size > 255? 255: size;
                        
                    for (j = 0; j < 12; ++j)
                        this.geometry.faces[i*12 + j].vertexColors = colors[size][j];
                        
                }, function() {
                    this.geometry.dynamic           = true;
                    this.geometry.colorsNeedUpdate  = true;
                    this.repainting                 = false;
                });
            }
        }
    }
    
    function onMouseDown(event) {
        event.preventDefault();
        
        container.addEventListener('mousemove', onMouseMove, false);
        container.addEventListener('mouseup', onMouseUp, false);
        container.addEventListener('mouseout', onMouseOut, false);
        
        mouseOnDown.x           = - event.clientX;
        mouseOnDown.y           = event.clientY;
        
        targetOnDown.x          = target.x;
        targetOnDown.y          = target.y;
        
        container.style.cursor  = 'move';
    }
    
    function onMouseMove(event) {
        mouse.x         = - event.clientX;
        mouse.y         = event.clientY;
        
        var zoomDamp    = distance/1000;
        
        target.x        = targetOnDown.x + (mouse.x - mouseOnDown.x) * 0.005 * zoomDamp;
        target.y        = targetOnDown.y + (mouse.y - mouseOnDown.y) * 0.005 * zoomDamp;
        
        target.y        = target.y > PI_HALF ? PI_HALF : target.y;
        target.y        = target.y < - PI_HALF ? - PI_HALF : target.y;
    }
    
    function onMouseUp(event) {
        container.removeEventListener('mousemove', onMouseMove, false);
        container.removeEventListener('mouseup', onMouseUp, false);
        container.removeEventListener('mouseout', onMouseOut, false);
        container.style.cursor = 'auto';
    }
    
    function onMouseOut(event) {
        container.removeEventListener('mousemove', onMouseMove, false);
        container.removeEventListener('mouseup', onMouseUp, false);
        container.removeEventListener('mouseout', onMouseOut, false);
    }
    
    function onMouseWheel(event) {
        event.preventDefault();
        if (overRenderer) {
            zoom(event.wheelDeltaY * 0.3);
        }
        return false;
    }
    
    function onDocumentKeyDown(event) {
        switch (event.keyCode) {
            case 38:
                zoom(100);
                event.preventDefault();
                break;
            case 40:
                zoom(-100);
                event.preventDefault();
                break;
        }
    }
    
    function onWindowResize( event ) {
        camera.aspect = container.offsetWidth / container.offsetHeight;
        camera.updateProjectionMatrix();
        renderer.setSize( container.offsetWidth , container.offsetHeight );
    }
    
    function zoom(delta) {
        distanceTarget -= delta;
        distanceTarget = distanceTarget > 1200 ? 1200 : distanceTarget;
        distanceTarget = distanceTarget < 550 ? 550 : distanceTarget;
    }
    
    this.init               = init;
    this.renderFrames       = renderFrames;
    this.animate            = animate;
    this.pointBufferParser  = pointBufferParser;
    this.vertexBufferParser = vertexBufferParser;
    this.verticesToBuffer   = verticesToBuffer;
    this.workerLoader       = workerLoader;
    this.loadBin            = loadBin;
    this.geometryBuilder         = geometryBuilder;
    this.addPoint           = addPoint;
    this.createPoints       = createPoints;
    this.zoom               = zoom;
    this.stop               = stop;
    this.opts               = opts;
    this.dispose            = dispose;
    this.target             = target;
    this.pointer            = pointer;
    this.checkSelection     = checkSelection;
    
    return this;
};