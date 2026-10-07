-- Tokens each generation run used, summed by step and model: [{ step, model, calls, input, output }].
alter table star_catch.catch_runs add column usage jsonb;
