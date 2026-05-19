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
        Schema::create('services', function (Blueprint $table) {
    $table->id();
    $table->foreignId('category_id')->constrained('service_categories')->cascadeOnDelete();
    $table->string('name');
    $table->decimal('rate_per_1000', 12, 2);
    $table->integer('min_order');
    $table->integer('max_order');
    $table->string('avg_time')->nullable();
    $table->text('description')->nullable();
    $table->string('platform');
    $table->boolean('is_active')->default(true);
    $table->boolean('is_featured')->default(false);
    $table->timestamps();
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('services');
    }
};
