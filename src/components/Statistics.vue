<template>
  <section>
    <h3>Statistics</h3>
    <div class="cards">
      <div class="card">
        <h5>Session solves</h5>
        {{ $state.solves.length }}
      </div>
      <div class="card">
        <h5>Total solves</h5>
        {{ $state.allSolves.length }}
      </div>
    </div>

    <div class="table-header">
      <h4>Averages</h4>
      <div class="btn-group">
        <button class="btn" :class="{ active: !showMoves }" @click="showMoves = false">Time</button>
        <button class="btn" :class="{ active: showMoves }" @click="showMoves = true">Moves</button>
      </div>
    </div>
    <table>
      <tr>
        <th style="width: 16%;">∑</th>
        <th style="width: 28%;">Worst</th>
        <th style="width: 28%;">Best</th>
        <th>Current</th>
      </tr>
      <tr v-for="avg in averages" :key="avg.n">
        <td>{{ avg.n }}</td>
        <td>{{ format(showMoves ? avg.mostMoves : avg.worstTime) }}</td>
        <td>{{ format(showMoves ? avg.fewestMoves : avg.bestTime) }}</td>
        <td>{{ format(showMoves ? avg.currentMoves : avg.currentTime) }}</td>
      </tr>
    </table>
    <LineChart
      ref="timeChart"
      :width="500"
      :height="300"
      @loaded="renderTimeChart"
      :styles="{ marginTop: '32px' }"
    />
    <LineChart
      ref="averageChart"
      v-if="showAverageChart"
      :width="500"
      :height="300"
      @loaded="renderAverageChart"
      :styles="{ marginTop: '32px' }"
    />
  </section>
</template>

<script lang="ts">
import { Vue, Component, Watch } from "vue-property-decorator"
import { EventType } from '../state'
import { Line } from "vue-chartjs"
import { Chart } from "chart.js"
import { average } from '../state/averages'

const gridLines = (dark?: boolean) => ({
  ...dark && {
    color: "rgba(255, 255, 255, 0.08)",
    zeroLineColor: "rgba(255, 255, 255, 0.14)"
  }
})

const fontColor = (dark?: boolean) => ({
  ...dark && {
    fontColor: "rgba(255, 255, 255, 0.8)"
  }
})

@Component({
  components: {
    LineChart: async () => Vue.extend({
      extends: (await import("vue-chartjs")).Line,
      mounted() {
        this.$emit("loaded")
      }
    })
  }
})
export default class Statistics extends Vue {
  showMoves = this.$state.event == EventType.Fmc
  showAverageChart = false

  $refs!: { timeChart: Line, averageChart: Line }

  @Watch("$state.event")
  handleEventTypeChange() {
    this.showMoves = this.$state.event == EventType.Fmc
  }

  get averages() {
    return [1, 3, 5, 12, 50, 100].map(n => ({ ...this.$state.averages.get(n), n }))
  }

  format(value?: number) {
    if (value == -1) return "DNF"
    if (this.showMoves) {
      return value ? Math.round(value * 10) / 10 : "―"
    } else {
      return this.$state.formatTime(value)
    }
  }

  @Watch("$state.darkMode")
  @Watch("$state.allSolves")
  @Watch("showMoves")
  renderTimeChart() {
    if (!this.$refs.timeChart) return

    const dark = this.$state.darkMode || undefined

    const scores = this.$state.allSolves.slice(-500).map((solve, i) => ({ x: i, y: this.showMoves ? solve.moves.length : solve.time }))

    const averages = scores.length > 1 ? scores.map((score, i) => {
      return [1, 5, 12].map(n => {
        const y = i < n - 1 ? -1 : average(new Uint32Array(scores.slice(i - n + 1, i + 1).map(x => x.y)))
        return {
          x: score.x,
          y: y == -1 ? undefined : y
        }
      })
    }) : []

    this.$refs.timeChart.renderChart({
      datasets: [2, 1, 0].map(i => ({
        label: i == 0 ? "Single" : `Ao${[5, 12][i - 1]}`,
        data: averages.map(x => x[i]),
        borderColor: ["rgba(120, 125, 130, 0.4)", "rgb(215, 80, 80)", "rgb(80, 180, 80)"][i],
        pointRadius: 0,
        pointHoverRadius: 0,
        lineTension: 0,
        borderWidth: 1 + i / 2,
        fill: false,
      }))
    }, {
      tooltips: { enabled: false },
      animation: { duration: 500 },
      legend: { labels: fontColor(dark) },
      scales: {
        xAxes: [{
          type: "linear",
          ticks: {
            callback: value => value == scores.length - 1 ? "" : value,
            min: scores[0]?.x,
            max: scores[scores.length - 1]?.x,
            ...fontColor(dark)
          },
          gridLines: gridLines(dark)
        }],
        yAxes: [{
          bounds: "data",
          ticks: {
            maxTicksLimit: 8,
            suggestedMax: 1000,
            callback: value => Math.round(value / 100) / 10,
            ...fontColor(dark)
          },
          gridLines: gridLines(dark)
        }]
      }
    })
  }

  @Watch("$state.darkMode")
  @Watch("$state.allSolves")
  async renderAverageChart() {
    if (!process.env.VUE_APP_API) return

    const response = await fetch(`${process.env.VUE_APP_API}/statistics/${this.$state.eventName}/${this.showMoves ? "moves" : "time"}`)
    const { labels, data } = await response.json()

    this.showAverageChart = labels.length > 1
    if (!this.$refs.averageChart || !this.showAverageChart) return

    let scores = this.$state.allSolves
      .filter(s => !s.dnf)
      .map(solve => this.showMoves ? solve.moves.length : solve.time / 1000)

    const start = labels[0]
    const end = labels[labels.length - 1]
    const step = labels[1] - labels[0]

    let you: number[] = labels.map(() => 0)

    for (const score of scores) {
      const pos = Math.min(labels.length - 1, score / step - start / step)
      const frac = pos - ~~pos
      you[~~pos] += 1 / scores.length * (1 - frac)
      you[~~pos + Math.ceil(frac)] += 1 / scores.length * frac
    }

    const max = you.reduce((a, b) => Math.max(a, b), 0)
    if (max > 0) you = you.map(x => x / max)

    const dark = this.$state.darkMode || undefined

    this.$refs.averageChart.renderChart({
      labels,
      datasets: [
        {
          label: "You",
          data: you,
          backgroundColor: "rgb(50, 140, 210, 0.22)",
          borderColor: "rgb(50, 140, 210, 1)",
          fill: true
        },
        {
          label: "Average user",
          data: data,
          backgroundColor: "rgb(50, 140, 210, 0.22)",
          borderColor: "transparent",
          fill: true
        }
      ]
    }, {
      tooltips: { enabled: false },
      animation: { duration: 0 },
      legend: { labels: fontColor(dark) },
      scales: {
        ...dark && {
          xAxes: [{
            ticks: fontColor(dark),
            gridLines: gridLines(dark)
          }]
        },
        yAxes: [{
          display: false,
          ticks: { beginAtZero: true }
        }]
      }
    })
  }
}
</script>

<style scoped>
.cards {
  display: flex;
  margin: 0 -4px;
}

.card {
  width: 50%;
  margin: 4px;
}

.table-header {
  display: flex;
  align-items: flex-end;
}

.table-header h4 {
  flex-grow: 1;
}
</style>
