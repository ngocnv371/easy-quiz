-- Question kinds beyond one-right-answer multiple choice. A kind decides what a question's options
-- mean and how an answer is graded (worker/grading.ts):
--   single        the player picks one option; exactly one is_correct
--   true_false    every option is a statement the player marks true or false; is_correct is its truth
--   short_answer  the player types a word or a number; every option is an accepted answer (is_correct = 1)
alter table questions add column kind text not null default 'single' check (kind in ('single', 'true_false', 'short_answer'));

-- What the player gave when it isn't a single option: a JSON object {"<option id>": true | false} for
-- true_false, the typed text for short_answer. Null for single (option_id says it all).
alter table attempt_answers add column response text;
