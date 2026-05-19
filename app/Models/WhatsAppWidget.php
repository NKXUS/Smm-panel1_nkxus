<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class WhatsAppWidget extends Model
{
    protected $table = 'whats_app_widgets';

    protected $fillable = [
        'phone_number',
        'greeting_message',
        'is_active'
    ];

    protected $casts = [
        'is_active' => 'boolean',
    ];
}
