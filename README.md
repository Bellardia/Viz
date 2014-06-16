Viz
===


A fork of Google's DAT Globe, optimized for rendering and streaming large datasets.

Features Added
---

* Non-blocking loading scripts prevent browser from hanging on large data sets
* Utilize WebWorkers to parallize loading of vertex sets
* Dyanmic coloring of vertexes (colours scale by magnitude by default)
* Allow new point sets to be dynamically loaded
* New Binary file format to greatly reduce the size of data files
* Fix several memory leaks and improved overally performance drastically

Roadmap
---
* Use raycasting to identify which points are being targeted by the cursor
* Highligh points targeted by cursor
* Create a real-time demo
