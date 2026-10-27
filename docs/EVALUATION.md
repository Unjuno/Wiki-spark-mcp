# Evaluate utility separately from connectivity

Functional tests establish that WikiSpark returns the intended data, not that it improves an AI's work.

For an exploratory comparison, preselect 20 tasks across interface design, software design and research brainstorming. For each task use the same model version, generation settings, total token budget and number of candidate outputs. Compare normal instructions, task-related Wikipedia context and WikiSpark random context. Store the full source snapshot and model output. Do not cherry-pick successful seeds.

Judge outputs blind to condition using predefined criteria: required constraints satisfied, unsupported factual claims, distinct actionable alternatives, and whether a proposal is worth testing. Record harms or wasted work as well as benefits. Repeat selected tasks to expose model variability. Twenty tasks are a pilot, not a power calculation or proof of broad superiority.

A useful negative result is that random context adds novelty but not acceptable proposals. Another is that any Wikipedia context performs similarly: that would weaken the claim that randomness itself adds value. No benefit claim is made by the current software release.
