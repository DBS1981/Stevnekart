document.addEventListener('DOMContentLoaded', function() {
    const grafPopup = document.getElementById('grafPopup');
    const åpneGrafKnapp = document.getElementById('åpneGrafKnapp');
    const grafCloseBtn = document.getElementById('grafCloseBtn');
    const compareYearsBtn = document.getElementById('compareYearsBtn');
    const selectAllYearsBtn = document.getElementById('selectAllYearsBtn');
    const clearAllYearsBtn = document.getElementById('clearAllYearsBtn');
    const yearSelector = document.getElementById('yearSelector');
    const typeSelector = document.getElementById('typeSelector');
    const spinner = document.getElementById('loadingSpinner');
    const container = document.getElementById('container');

    const typeColors = { "Bane": "#007bff", "Felt": "#28a745", "Inne": "#6f42c1", "default": "#fd7e14" };

    let chartInstance = null;
    let allAvailableYears = [];

    åpneGrafKnapp.addEventListener('click', () => {
        grafPopup.style.display = 'block';
        fetchAndPrepareYears();
    });

    grafCloseBtn.addEventListener('click', () => {
        grafPopup.style.display = 'none';
    });

    compareYearsBtn.addEventListener('click', () => {
        fetchAndDisplayGraph();
    });

    selectAllYearsBtn.addEventListener('click', () => {
        document.querySelectorAll('#yearSelector input[type="checkbox"]').forEach(cb => cb.checked = true);
    });

    clearAllYearsBtn.addEventListener('click', () => {
        document.querySelectorAll('#yearSelector input[type="checkbox"]').forEach(cb => cb.checked = false);
    });

    function hexToRgb(hex) {
        hex = hex.replace('#', '');
        const bigint = parseInt(hex, 16);
        return { r: (bigint >> 16) & 255, g: (bigint >> 8) & 255, b: bigint & 255 };
    }

    async function fetchAndPrepareYears() {
        try {
            spinner.style.display = 'block';
            const response = await fetch('/data/stevner.json?cache=' + Date.now());
            const data = await response.json();
            spinner.style.display = 'none';

            const years = new Set();
            const types = new Set();
            data.forEach(event => {
                const [d, m, y] = event.fra.split('.');
                years.add(y);
                types.add(event.arrangementstype || "Ukjent");
            });

            allAvailableYears = Array.from(years).sort();
            yearSelector.innerHTML = "<strong>År:</strong><br>";
            allAvailableYears.forEach(year => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="${year}"><span>${year}</span>`;
                yearSelector.appendChild(label);
            });

            const newestYear = Math.max(...allAvailableYears.map(Number)).toString();
            document.querySelectorAll('#yearSelector input[type="checkbox"]').forEach(cb => {
                if (cb.value === newestYear) cb.checked = true;
            });

            typeSelector.innerHTML = "<strong>Stevnetyper:</strong><br>";
            Array.from(types).sort().forEach(type => {
                const label = document.createElement('label');
                label.innerHTML = `<input type="checkbox" value="${type}" checked><span>${type}</span>`;
                typeSelector.appendChild(label);
            });

        } catch (error) {
            spinner.style.display = 'none';
            console.error('Feil ved lasting av stevner:', error);
        }
    }

    async function fetchAndDisplayGraph() {
        try {
            spinner.style.display = 'block';
            const response = await fetch('/data/stevner.json?cache=' + Date.now());
            const data = await response.json();
            spinner.style.display = 'none';

            if (chartInstance) chartInstance.destroy();

            const selectedYears = Array.from(document.querySelectorAll('#yearSelector input[type="checkbox"]:checked')).map(cb => cb.value);
            const selectedTypes = Array.from(document.querySelectorAll('#typeSelector input[type="checkbox"]:checked')).map(cb => cb.value);

            if (selectedYears.length === 0 || selectedTypes.length === 0) {
                alert("Velg minst ett år og én stevnetype!");
                return;
            }

            const typeYearGroups = {};
            data.forEach(event => {
                const [d, m, y] = event.fra.split('.');
                if (!selectedYears.includes(y) || !selectedTypes.includes(event.arrangementstype)) return;
                const monthNum = parseInt(m);
                const type = event.arrangementstype;
                if (!typeYearGroups[type]) { typeYearGroups[type] = {}; }
                if (!typeYearGroups[type][y]) { typeYearGroups[type][y] = Array(12).fill(0); }
                typeYearGroups[type][y][monthNum - 1]++;
            });

            const seriesData = [];
            selectedYears.sort().forEach((year, index) => {
                Object.keys(typeYearGroups).forEach(type => {
                    if (typeYearGroups[type][year]) {
                        const baseColor = typeColors[type] || typeColors["default"];
                        const rgb = hexToRgb(baseColor);
                        const opacity = 1 - (index * 0.2);
                        seriesData.push({
                            name: `${type} - ${year}`,
                            data: typeYearGroups[type][year].map((count, monthIndex) => ({ x: monthIndex, y: count })),
                            color: `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${Math.max(opacity, 0.3)})`
                        });
                    }
                });
            });

            chartInstance = Highcharts.chart('container', {
                chart: { type: 'spline' },
                title: { text: 'År-til-år sammenligning (valgte år og typer)' },
                xAxis: { type: 'category', categories: ['Jan', 'Feb', 'Mar', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Des'], title: { text: 'Måned' } },
                yAxis: { title: { text: 'Antall stevner' }, allowDecimals: false },
                tooltip: { formatter: function () { return `<b>${this.series.name}</b><br/>Måned: ${this.x}<br/>Antall: ${this.y}`; } },
                series: seriesData
            });

        } catch (error) {
            spinner.style.display = 'none';
            console.error('Feil ved lasting av graf:', error);
        }
    }
});
