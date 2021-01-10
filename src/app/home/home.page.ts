import { Component } from '@angular/core';
import { Platform } from '@ionic/angular';
import { LoadingController } from '@ionic/angular';
import { FormGroup, FormControl, Validators } from '@angular/forms';
import { Map, tileLayer, circle } from 'leaflet';

import { ChartDataSets, ChartOptions } from 'chart.js';
import { Color, Label } from 'ng2-charts';

import { ApiService } from '../services/api.service';

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
})
export class HomePage {
  form: FormGroup;
  map: Map;
  startingDateSelected = '';
  endingDateSelected = '';
  countriesSelected = '';
  covidData = {
    totalConfirmed: 0,
    totalDeaths: 0,
    totalRecovered: 0,
    countries: {}
  }

  countriesList = [];

  chartsData = [];

  public chartLegend = true;
  public chartType = 'line';
  public chartPlugins = [];

  constructor(
    public plt: Platform,
    private loadingController: LoadingController,
    private ApiService: ApiService
  ) { }


  ngOnInit() {
    // 2020-12-06
    this.form = new FormGroup({
      startingDate: new FormControl('2020-12-06', {
        updateOn: 'blur',
      }),
      endingDate: new FormControl('2020-12-06', {
        updateOn: 'blur',
      }),
      countries: new FormControl(null, {
        updateOn: 'blur',
      }),
    });
  }

  ngAfterViewInit() {
    this.plt.ready().then(() => {
      this.getData();
    });
  }

  async getData() {
    const loadingEl = await this.loadingController.create({ message: 'Fetching Data' });
    loadingEl.present();

    this.startingDateSelected = '';
    this.endingDateSelected = '';
    this.countriesSelected = '';
    let query = '';
    if (!this.form.get('startingDate').value && !this.form.get('endingDate').value && !this.form.get('countries').value) {
      query = 'ObservationDate=12/06/2020';
    } else {
      if (this.form.get('startingDate').value) {
        this.startingDateSelected = this.form.get('startingDate').value;
        query += `ObservationDate[$gte]=${this.formatDate(this.form.get('startingDate').value)}&`;
      }
      if (this.form.get('endingDate').value) {
        this.endingDateSelected = this.form.get('endingDate').value;
        query += `ObservationDate[$lte]=${this.formatDate(this.form.get('endingDate').value)}&`;
      }
      if (this.form.get('countries').value) {
        // query += `$limit=200000&`
        this.countriesSelected = this.form.get('countries').value.join(', ');
        this.form.get('countries').value.forEach((country, index) => {
          query += `$or[${index}][Country/Region]=${country.trim()}&`
        });
      }
    }

    this.ApiService.getData(query).subscribe(async res => {
      this.clearMap();
      await this.updateMap(res.data);
      this.form.reset();
      loadingEl.dismiss();
    });
  }

  async updateMap(data) {
    if (!this.map) {
      this.map = new Map('map').setView([40, 0], 2);

      tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      }).addTo(this.map);
    }
    this.covidData = {
      totalConfirmed: 0,
      totalDeaths: 0,
      totalRecovered: 0,
      countries: { }
    }
    let maxConfirmed = 0;
    data.forEach(country => {
      const details = this.ApiService.getCountryCoordinates(country['Country/Region']);

      if (details) {

        if (!this.covidData.countries[details.name]) {
          this.countriesList.push(country['Country/Region']);
          this.covidData.countries[details.name] = details
          this.covidData.countries[details.name].cases = {}
        }

        if (this.covidData.countries[details.name].cases[country.ObservationDate]) {

          this.covidData.countries[details.name].cases[country.ObservationDate].confirmed += country.Confirmed;
          this.covidData.countries[details.name].cases[country.ObservationDate].deaths += country.Deaths;
          this.covidData.countries[details.name].cases[country.ObservationDate].recovered += country.Recovered;

          if (this.covidData.countries[details.name].cases[country.ObservationDate].confirmed > maxConfirmed) {
            maxConfirmed = this.covidData.countries[details.name].cases[country.ObservationDate].confirmed;
          }
        } else {
          this.covidData.countries[details.name].cases[country.ObservationDate] = {
            confirmed: country.Confirmed,
            deaths: country.Deaths,
            recovered: country.Recovered,
          }
        }
        this.covidData.countries[details.name].confirmed = country.Confirmed;
        this.covidData.countries[details.name].deaths = country.Deaths;
        this.covidData.countries[details.name].recovered = country.Recovered;
      }
    });

    this.countriesList = [...new Set(this.countriesList)].sort();

    Object.getOwnPropertyNames(this.covidData.countries).forEach(country => {

      const details = this.covidData.countries[country];

      this.covidData.totalConfirmed += details.confirmed
      this.covidData.totalDeaths += details.deaths
      this.covidData.totalRecovered += details.recovered

    })


    if (maxConfirmed === 0) {
      maxConfirmed = 10000
    }

    const n = Object.getOwnPropertyNames(this.covidData.countries).length;
    this.chartsData = [];

    Object.getOwnPropertyNames(this.covidData.countries).forEach(country => {
      const details = this.covidData.countries[country];
      const d = {
        confirmed: [],
        recovered: [],
        deaths: [],
      };
      const l = [];
      let t = 0;

      Object.keys(details.cases).forEach((c) => {
        t += details.cases[c].confirmed
        l.push(c)
        d.confirmed.push(details.cases[c].confirmed)
        d.recovered.push(details.cases[c].recovered)
        d.deaths.push(details.cases[c].deaths)
      })

      const chartData: ChartDataSets[] = [
        { data: d.confirmed, label: 'Confirmed' },
        { data: d.recovered, label: 'Recovered' },
        { data: d.deaths, label: 'Deaths' },
      ];

      const chartLabels: Label[] = l;

      const chartOptions: ChartOptions = {
        responsive: true,
        title: {
          display: true,
          text: country
        }
      };

      this.chartsData.push({chartData, chartLabels, chartOptions})

      if (t !== 0) {
        circle([details.lat, details.lon], (t * n * 5000) / (maxConfirmed), {
          color: 'red',
          fillColor: '#f03',
          fillOpacity: 0.5
        }).bindTooltip(`${details.name} (${details.confirmed})`).addTo(this.map);
      }
    })
  }

  clearMap() {
    if (!this.map) return;

    for (let i in this.map._layers) {
      if (this.map._layers[i]._path != undefined) {
        try {
          this.map.removeLayer(this.map._layers[i]);
        }
        catch (e) {
          console.log("problem with " + e + this.map._layers[i]);
        }
      }
    }
  }

  formatDate(date) {
    // 2020-12-09 -> 12/09/2020
    const d = date.split('-');
    return `${d[1]}/${d[2]}/${d[0]}`
  }
}



