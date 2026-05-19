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
        Schema::create('service_updates', function (Blueprint $table) {
    $table->id();
    $table->foreignId('service_id')->constrained('services')->cascadeOnDelete();
    $table->enum('type', ['new', 'rate_dec', 'rate_inc', 'enabled', 'disabled']);
    $table->decimal('old_rate', 12, 2)->nullable();
    $table->decimal('new_rate', 12, 2)->nullable();
    $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('service_updates');
    }
};
