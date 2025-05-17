// Initialize the map with better defaults
let map = L.map('map').setView([20, 0], 2);

// Basemap layers with better visual options
const basemaps = {
    light: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        maxZoom: 19,
        detectRetina: true
    }),
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        subdomains: 'abcd',
        maxZoom: 19,
        detectRetina: true
    }),
    satellite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        maxZoom: 19,
        detectRetina: true
    })
};

// Add default basemap
basemaps.light.addTo(map);
document.querySelector('.basemap-option[data-value="light"]').classList.add('active');

// Variables to store data and layers
let csvData = null;
let markersLayer = null;
let buffersLayer = null;

// DOM elements
const csvButton = document.getElementById('csvButton');
const plotButton = document.getElementById('plotButton');
const csvFileInput = document.getElementById('csvFileInput');
const csvStatus = document.getElementById('csvStatus');
const basemapOptions = document.querySelectorAll('.basemap-option');
const bufferRange = document.getElementById('bufferRange');
const bufferValue = document.getElementById('bufferValue');
const applyBuffer = document.getElementById('applyBuffer');
const clearBuffer = document.getElementById('clearBuffer');
const loadingSpinner = document.getElementById('loadingSpinner');
const coordinatesDisplay = document.getElementById('coordinates');
const zoomLevelDisplay = document.getElementById('zoom-level');

// Event listeners
csvButton.addEventListener('click', () => {
    csvFileInput.value = ''; // Reset input to allow same file to be selected again
    csvFileInput.click();
});
csvFileInput.addEventListener('change', handleCSVUpload);
plotButton.addEventListener('click', plotMarkers);
basemapOptions.forEach(option => {
    option.addEventListener('click', () => changeBasemap(option.dataset.value));
});
bufferRange.addEventListener('input', updateBufferValue);
applyBuffer.addEventListener('click', createBuffers);
clearBuffer.addEventListener('click', clearBuffers);

// Map events for coordinates and zoom display
map.on('mousemove', showCoordinates);
map.on('zoomend', updateZoomLevel);

// Initialize buffer value display
updateBufferValue();

// Show loading spinner
function showLoading() {
    loadingSpinner.style.display = 'flex';
}

// Hide loading spinner
function hideLoading() {
    loadingSpinner.style.display = 'none';
}

// Handle CSV file upload with better feedback
function handleCSVUpload(event) {
    const file = event.target.files[0];
    if (!file) return;

    showLoading();
    csvStatus.textContent = "Processing CSV file...";
    csvStatus.style.color = "var(--sidebar-accent)";
    
    // Use FileReader to read the file
    const reader = new FileReader();
    
    reader.onload = function(e) {
        const content = e.target.result;
        
        Papa.parse(content, {
            header: true,
            skipEmptyLines: true,
            complete: function(results) {
                hideLoading();
                
                // Check if CSV has latitude and longitude columns (case insensitive)
                const headers = results.meta.fields ? 
                    results.meta.fields.map(h => h.toLowerCase()) : [];
                
                const hasLat = headers.includes('latitude') || headers.includes('lat');
                const hasLng = headers.includes('longitude') || headers.includes('lng') || 
                              headers.includes('lon') || headers.includes('long');
                
                if (!hasLat || !hasLng) {
                    csvStatus.textContent = "Error: CSV must contain latitude and longitude columns";
                    csvStatus.style.color = "var(--danger-color)";
                    csvData = null;
                    plotButton.disabled = true;
                    applyBuffer.disabled = true;
                    clearBuffer.disabled = true;
                    return;
                }
                
                // Filter out rows with invalid coordinates
                csvData = results.data.filter(row => {
                    const latKey = Object.keys(row).find(key => 
                        key.toLowerCase() === 'latitude' || key.toLowerCase() === 'lat');
                    const lngKey = Object.keys(row).find(key => 
                        key.toLowerCase() === 'longitude' || key.toLowerCase() === 'lng' || 
                        key.toLowerCase() === 'lon' || key.toLowerCase() === 'long');
                    
                    const lat = parseFloat(row[latKey]);
                    const lng = parseFloat(row[lngKey]);
                    
                    return !isNaN(lat) && !isNaN(lng) && lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
                });
                
                if (csvData.length === 0) {
                    csvStatus.textContent = "Error: No valid coordinates found in CSV";
                    csvStatus.style.color = "var(--danger-color)";
                    plotButton.disabled = true;
                    applyBuffer.disabled = true;
                    clearBuffer.disabled = true;
                    return;
                }
                
                const invalidCount = results.data.length - csvData.length;
                let statusMessage = `Successfully loaded ${csvData.length} valid records`;
                if (invalidCount > 0) {
                    statusMessage += ` (${invalidCount} invalid records skipped)`;
                }
                
                csvStatus.textContent = statusMessage;
                csvStatus.style.color = "var(--success-color)";
                plotButton.disabled = false;
                
                // Clear previous markers and buffers if any
                clearLayers();
            },
            error: function(error) {
                hideLoading();
                csvStatus.textContent = "Error parsing CSV: " + error.message;
                csvStatus.style.color = "var(--danger-color)";
                csvData = null;
                plotButton.disabled = true;
                applyBuffer.disabled = true;
                clearBuffer.disabled = true;
            }
        });
    };
    
    reader.onerror = function() {
        hideLoading();
        csvStatus.textContent = "Error reading file";
        csvStatus.style.color = "var(--danger-color)";
    };
    
    reader.readAsText(file);
}

// Plot markers on the map with better visuals
function plotMarkers() {
    if (!csvData || csvData.length === 0) return;
    
    showLoading();
    setTimeout(() => {
        // Clear previous markers and buffers if any
        clearLayers();
        
        markersLayer = L.layerGroup().addTo(map);
        let bounds = [];
        let hasInvalidCoords = false;
        
        csvData.forEach(row => {
            // Find latitude/longitude columns (case insensitive)
            const latKey = Object.keys(row).find(key => 
                key.toLowerCase() === 'latitude' || key.toLowerCase() === 'lat');
            const lngKey = Object.keys(row).find(key => 
                key.toLowerCase() === 'longitude' || key.toLowerCase() === 'lng' || 
                key.toLowerCase() === 'lon' || key.toLowerCase() === 'long');
            
            const lat = parseFloat(row[latKey]);
            const lng = parseFloat(row[lngKey]);
            
            if (!isNaN(lat) && !isNaN(lng)) {
                const marker = L.circleMarker([lat, lng], {
                    radius: 6,
                    fillColor: "#ff7800",
                    color: "#fff",
                    weight: 1,
                    opacity: 1,
                    fillOpacity: 0.8
                }).addTo(markersLayer);
                
                bounds.push([lat, lng]);
                
                // Add popup with all data
                let popupContent = '<div class="popup-content">';
                for (const key in row) {
                    popupContent += `<div class="popup-row"><strong>${key}:</strong> <span>${row[key]}</span></div>`;
                }
                popupContent += '</div>';
                marker.bindPopup(popupContent);
                
                // Add hover effects
                marker.on('mouseover', function() {
                    this.setStyle({
                        fillColor: "#ff0000",
                        radius: 8
                    });
                });
                
                marker.on('mouseout', function() {
                    this.setStyle({
                        fillColor: "#ff7800",
                        radius: 6
                    });
                });
            } else {
                hasInvalidCoords = true;
            }
        });
        
        if (bounds.length > 0) {
            map.fitBounds(bounds, { padding: [50, 50] });
        }
        
        applyBuffer.disabled = false;
        clearBuffer.disabled = false;
        bufferRange.disabled = false;
        
        if (hasInvalidCoords) {
            csvStatus.textContent += " (some invalid coordinates were skipped)";
            csvStatus.style.color = "var(--warning-color)";
        }
        
        hideLoading();
    }, 300);
}

// Change basemap with visual feedback
function changeBasemap(selectedBasemap) {
    // Update active state
    basemapOptions.forEach(option => {
        option.classList.remove('active');
    });
    document.querySelector(`.basemap-option[data-value="${selectedBasemap}"]`).classList.add('active');
    
    // Remove all basemaps
    for (const key in basemaps) {
        map.removeLayer(basemaps[key]);
    }
    
    // Add selected basemap
    basemaps[selectedBasemap].addTo(map);
}

// Update buffer value display
function updateBufferValue() {
    bufferValue.textContent = bufferRange.value;
}

// Create buffers around markers
function createBuffers() {
    const bufferRadius = parseInt(bufferRange.value);
    if (!bufferRadius || isNaN(bufferRadius) || !markersLayer) return;
    
    showLoading();
    setTimeout(() => {
        // Clear previous buffers if any
        if (buffersLayer) {
            map.removeLayer(buffersLayer);
        }
        
        buffersLayer = L.layerGroup().addTo(map);
        
        markersLayer.eachLayer(marker => {
            const latlng = marker.getLatLng();
            const buffer = L.circle(latlng, {
                radius: bufferRadius,
                color: "#3388ff",
                weight: 2,
                fillColor: "#3388ff",
                fillOpacity: 0.2
            }).addTo(buffersLayer);
            
            // Add popup with buffer info
            buffer.bindPopup(`<div class="popup-content">
                <div class="popup-row"><strong>Buffer Radius:</strong> <span>${bufferRadius} meters</span></div>
                <div class="popup-row"><strong>Coordinates:</strong> <span>${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}</span></div>
            </div>`);
        });
        
        hideLoading();
    }, 300);
}

// Clear buffers from map
function clearBuffers() {
    if (buffersLayer) {
        map.removeLayer(buffersLayer);
        buffersLayer = null;
    }
}

// Clear all layers (markers and buffers)
function clearLayers() {
    if (markersLayer) {
        map.removeLayer(markersLayer);
        markersLayer = null;
    }
    clearBuffers();
}

// Show current coordinates on mouse move
function showCoordinates(e) {
    coordinatesDisplay.textContent = `Lat: ${e.latlng.lat.toFixed(4)}, Lng: ${e.latlng.lng.toFixed(4)}`;
}

// Update zoom level display
function updateZoomLevel() {
    zoomLevelDisplay.textContent = `Zoom: ${map.getZoom()}`;
}