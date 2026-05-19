<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::table('smmusers', function (Blueprint $table) {
            $table->foreignId('referrer_id')
                ->nullable()
                ->after('api_token')
                ->constrained('smmusers')
                ->nullOnDelete();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('smmusers', function (Blueprint $table) {
            $table->dropConstrainedForeignId('referrer_id');
        });
    }
};
