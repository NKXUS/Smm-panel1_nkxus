<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Model;

class SmmUser extends Model
{
    use HasFactory;

    protected $table = 'smmusers';

    protected $fillable = [
        'username',
        'email',
        'phone_number',
        'password',
        'balance',
        'api_key',
        'api_token',
        'role',
        'referrer_id',
        'language',
        'timezone',
        'currency',
        'two_fa_enabled',
        'telegram_id',
        'google_id',
        'google_avatar',
    ];

    protected $hidden = [
        'password',
        'api_key',
        'api_token',
    ];

    protected $casts = [
        'balance' => 'decimal:2',
        'two_fa_enabled' => 'boolean',
    ];

    /*
    |--------------------------------------------------------------------------
    | Relationships
    |--------------------------------------------------------------------------
    */

    public function orders()
    {
        return $this->hasMany(Order::class, 'user_id');
    }

    public function payments()
    {
        return $this->hasMany(Payment::class, 'user_id');
    }

    public function massOrders()
    {
        return $this->hasMany(MassOrder::class, 'user_id');
    }

    public function supportTickets()
    {
        return $this->hasMany(SupportTicket::class, 'user_id');
    }

    public function apiKeys()
    {
        return $this->hasMany(ApiKey::class, 'user_id');
    }

    public function notificationPreferences()
    {
        return $this->hasMany(NotificationPreference::class, 'user_id');
    }

    public function referralsMade()
    {
        return $this->hasMany(Referral::class, 'referrer_id');
    }

    public function referrer()
    {
        return $this->belongsTo(SmmUser::class, 'referrer_id');
    }

    public function referredUsers()
    {
        return $this->hasMany(SmmUser::class, 'referrer_id');
    }
}
