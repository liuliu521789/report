<template>
  <p ref="rootRef" class="blur-text" :class="className">
    <Motion
      v-for="(segment, index) in elements"
      :key="`${segment}-${index}-${animKey}`"
      tag="span"
      :initial="fromSnapshot"
      :animate="inView ? buildKeyframes(fromSnapshot, toSnapshots) : fromSnapshot"
      :transition="getTransition(index)"
      @animation-complete="handleAnimationComplete(index)"
      class="blur-text__seg"
    >
      {{ segment === ' ' ? '\u00A0' : segment }}
      <template v-if="animateBy === 'words' && index < elements.length - 1">&nbsp;</template>
    </Motion>
  </p>
</template>

<script setup>
import { Motion } from 'motion-v';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';

const props = defineProps({
  text: { type: String, default: '' },
  delay: { type: Number, default: 200 },
  className: { type: String, default: '' },
  animateBy: { type: String, default: 'words' },
  direction: { type: String, default: 'top' },
  threshold: { type: Number, default: 0.1 },
  rootMargin: { type: String, default: '0px' },
  animationFrom: { type: Object, default: undefined },
  animationTo: { type: Array, default: undefined },
  easing: { type: Function, default: (t) => t },
  onAnimationComplete: { type: Function, default: undefined },
  stepDuration: { type: Number, default: 0.35 }
});

function buildKeyframes(from, steps) {
  const keys = new Set([...Object.keys(from), ...steps.flatMap((s) => Object.keys(s))]);
  const keyframes = {};
  keys.forEach((k) => {
    keyframes[k] = [from[k], ...steps.map((s) => s[k])];
  });
  return keyframes;
}

const inView = ref(false);
const animKey = ref(0);
const rootRef = ref(null);
let observer = null;

function triggerInView() {
  if (!rootRef.value) return;
  if (!observer) {
    observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          inView.value = true;
          observer?.unobserve(rootRef.value);
        }
      },
      {
        threshold: props.threshold,
        rootMargin: props.rootMargin
      }
    );
  }
  observer.observe(rootRef.value);
}

onMounted(() => {
  triggerInView();
});

onBeforeUnmount(() => {
  observer?.disconnect();
  observer = null;
});

watch(
  () => [props.text, props.animateBy, props.direction, props.delay],
  async () => {
    inView.value = false;
    animKey.value += 1;
    await nextTick();
    // 文案切换时强制重播（overlay 已在视口内，IO 不一定再次触发）
    inView.value = true;
  }
);

const elements = computed(() =>
  props.animateBy === 'words' ? props.text.split(' ') : Array.from(props.text || '')
);

const defaultFrom = computed(() =>
  props.direction === 'top'
    ? { filter: 'blur(10px)', opacity: 0, y: -50 }
    : { filter: 'blur(10px)', opacity: 0, y: 50 }
);

const defaultTo = computed(() => [
  {
    filter: 'blur(5px)',
    opacity: 0.5,
    y: props.direction === 'top' ? 5 : -5
  },
  {
    filter: 'blur(0px)',
    opacity: 1,
    y: 0
  }
]);

const fromSnapshot = computed(() => props.animationFrom ?? defaultFrom.value);
const toSnapshots = computed(() => props.animationTo ?? defaultTo.value);

const stepCount = computed(() => toSnapshots.value.length + 1);
const totalDuration = computed(() => props.stepDuration * (stepCount.value - 1));

const times = computed(() =>
  Array.from({ length: stepCount.value }, (_, i) =>
    stepCount.value === 1 ? 0 : i / (stepCount.value - 1)
  )
);

function getTransition(index) {
  return {
    duration: totalDuration.value,
    times: times.value,
    delay: (index * props.delay) / 1000,
    ease: props.easing
  };
}

function handleAnimationComplete(index) {
  if (index === elements.value.length - 1) {
    props.onAnimationComplete?.();
  }
}
</script>

<style scoped>
.blur-text {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  margin: 0;
}

.blur-text__seg {
  display: inline-block;
  will-change: transform, filter, opacity;
}
</style>
