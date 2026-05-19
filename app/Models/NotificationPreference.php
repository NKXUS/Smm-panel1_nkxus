<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class NotificationPreference extends Model
{
    protected $fillable = [
        'user_id',
        'type',
        'email_enabled',
        'telegram_enabled',
        'telegram_connected'
    ];

    protected $casts = [
        'email_enabled' => 'boolean',
        'telegram_enabled' => 'boolean',
        'telegram_connected' => 'boolean',
    ];

   public function user()
{
    return $this->belongsTo(SmmUser::class, 'user_id');
}
}
