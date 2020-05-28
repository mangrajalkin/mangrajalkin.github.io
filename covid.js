($=>{
	Promise.all([
			$('https://usafactsstatic.blob.core.windows.net/public/data/covid-19/covid_confirmed_usafacts.csv'),
			$('https://usafactsstatic.blob.core.windows.net/public/data/covid-19/covid_deaths_usafacts.csv'),
			new Promise((resolve, reject) => {
				const script = document.createElement('script');
				script.onload = resolve;
				script.type = 'text/javascript';
				script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/2.9.3/Chart.bundle.min.js';
				document.head.appendChild(script);
			})])
		.then(([confirmed, deaths]) => {
			const
				canvas = document.createElement('canvas'),
				ui = document.createElement('div'),
				header = document.createElement('header'),
				selectState = document.createElement('select'),
				selectStateLabel = document.createElement('label'),
				selectCounty = document.createElement('select'),
				selectCountyLabel = document.createElement('label'),
				main = document.createElement('div'),
				footer = document.createElement('footer'),
				chart = new Chart(canvas, {
					type: 'line',
					data: {
						datasets: [
							{
								label: 'Confirmed Cases',
								fill: 1,
								backgroundColor: 'rgba(0,0,255,0.5)',
								data: []
							},
							{
								label: 'Deaths',
								fill: 'origin',
								backgroundColor: 'rgba(255,0,0,0.5)',
								data: []
							}]
					},
					options: {
						maintainAspectRatio: false,
						scales: {
							xAxes: [{type: 'time', time: {unit: 'day'}}]
						},
						tooltips: {
							mode: 'x'
						},
						title: {
							display: true,
							text: ['COVID-19 Daily Data', '']
						}
					}
				});
			ui.style.height = '100vh';
			ui.style.display = 'flex';
			ui.style.flexDirection = 'column';
			
			header.style.display = 'flex';
			selectState.id = 'state';
			selectStateLabel.for = selectState.id;
			selectCounty.id = 'county';
			selectCountyLabel.for = selectCounty.id;
			
			selectStateLabel.appendChild(document.createTextNode('Select State:'));
			selectCountyLabel.appendChild(document.createTextNode('Select County:'));
			
			function comparator(a, b) {
				if (a == 'All') {
					return -1;
				} else if (b == 'All') {
					return 1;
				} else if (a < b) {
					return -1;
				} else if (a > b) {
					return 1;
				} else {
					return 0;
				}
			}
			
			function generateDropdown(obj, target) {
				while (target.firstChild) {
					target.removeChild(target.lastChild);
				}
				const items = Object.keys(obj).sort(comparator);
				for (let item of items) {
					const option = document.createElement('option');
					option.value = item;
					option.appendChild(document.createTextNode(item));
					target.appendChild(option);
				}
			}
			
			header.appendChild(selectStateLabel);
			header.appendChild(selectState);
			header.appendChild(selectCountyLabel);
			header.appendChild(selectCounty);
			
			generateDropdown(confirmed, selectState);
			selectCountyLabel.style.visibility = 'hidden';
			selectCounty.style.visibility = 'hidden';
			generateDropdown(confirmed.All, selectCounty);
			
			selectState.addEventListener('change', () => {
				const selected = selectState.value;
				generateDropdown(confirmed[selected], selectCounty);
				if (selected == 'All') {
					selectCountyLabel.style.visibility = 'hidden';
					selectCounty.style.visibility = 'hidden';
				} else {
					selectCountyLabel.style.visibility = 'visible';
					selectCounty.style.visibility = 'visible';
				}
				chart.setCovidData(selected, 'All');
			});
			
			selectCounty.addEventListener('change', () => {
				const selected = selectCounty.value;
				chart.setCovidData(selectState.value, selectCounty.value)
			});
			
			main.style.flex = '1';
			main.appendChild(canvas);
			ui.appendChild(header);
			ui.appendChild(main);
			ui.appendChild(footer);
			document.body.style.margin = '0';
			document.body.appendChild(ui);
			chart.setCovidData = function (displayRegion, drillDown) {
				this.data.datasets[0].data = confirmed[displayRegion][drillDown];
				this.data.datasets[1].data = deaths[displayRegion][drillDown];
				this.options.title.text[1] = displayRegion + ' ' + drillDown;
				document.title = this.options.title.text.join(' - ');
				this.update();
				this.resize();
				return this;
			};
			return chart;
		}).then(chart => chart.setCovidData('All', 'All'));
})(function(url) {
	const
		decoder = new TextDecoder('utf-8'),
		result = {All: {All: []}},
		dates = [],
		row = [],
		STATE_END_FIELD = 1 << 1,
		STATE_CR = 1 << 2,
		STATE_NL = 1 << 3,
		STATE_END_ROW = STATE_CR | STATE_NL,
		STATE_NEED_PROCESSING = STATE_END_FIELD | STATE_END_ROW;
	let
		state = 0,
		chunk = new Uint8Array(1024), // TODO: dynamic size?
		chunkIndex = 0,
		fieldIndex = 0,
		handleRow = function() {
			// Process dates in the header
			for (let i = 4, j = 0; i < fieldIndex; i++,j++) {
				dates[j] = new Date(row[i]);
			}
			// Subsequent rows are to be handled differently.
			handleRow = function() {
				if (row[0] != '0') {
					const stateObj = result[row[2]] || (result[row[2]] = {All: []});
					let lastPoint = 0;
					for (let i = 4, j = 0; i < fieldIndex; i++,j++) {
						const
							currentPoint = parseInt(row[i]),
							delta = currentPoint - lastPoint,
							date = dates[j];
						(stateObj[row[1]] || (stateObj[row[1]] = []))[j] = {
							t: date,
							y: delta
						};
						totalPoint = result.All.All[j] || (result.All.All[j] = {
							t: date,
							y: 0
						});
						stateTotalPoint = stateObj.All[j] || (stateObj.All[j] = {
							t: date,
							y: 0
						});
						totalPoint.y += delta;
						stateTotalPoint.y += delta;
						lastPoint = currentPoint;
					}
				}
			};
		};
	function handleChunk() {
		if (state & STATE_NEED_PROCESSING) {
			row[fieldIndex++] = decoder.decode(chunk.subarray(0, chunkIndex));
			chunkIndex = 0;
			if (state & STATE_END_ROW) {
				handleRow();
				fieldIndex = 0;
			}
			state &= ~STATE_NEED_PROCESSING;
		}
		return state;
	}
	return fetch(url)
		.then(response => response.body.getReader())
		.then(reader => reader.read().then(
			function process({done, value}) {
				if (done) {
					handleChunk();
					return result;
				} else {
					const len = value.length;
					let i = 0;
					while (i < len) {
						const b = value[i++];
						switch(b) {
							case 0x2C: // ,
								state |= STATE_END_FIELD;
								break;
							case 0x0D: // \r
								state |= STATE_CR;
								break;
							case 0x0A: // \n
								state |= STATE_NL;
								break;
							default:
								handleChunk();
								chunk[chunkIndex++] = b;
								break;
						}
					}
					return reader.read().then(process);
				}
			}
		));
});
