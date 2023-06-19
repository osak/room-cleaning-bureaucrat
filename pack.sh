set -x
set -eo pipefail

rm -r .deno_dir/LAMBDA_TASK_ROOT
DENO_DIR=.deno_dir deno cache lambda.ts
cp -R .deno_dir/gen/file/$PWD/ .deno_dir/LAMBDA_TASK_ROOT
zip lambda.zip -x '.deno_dir/gen/file/*' -r .deno_dir *.ts